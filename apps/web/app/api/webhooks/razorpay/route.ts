/**
 * POST /api/webhooks/razorpay
 *
 * Handles Razorpay webhook events for all merchants.
 *
 * SUPPORTED EVENTS:
 *   payment.failed              → Insert failed payment + dispatch recovery job
 *   subscription.halted         → Subscription failed to charge → recovery email sequence
 *   subscription.paused         → Paused by merchant/customer → log, no action
 *   subscription.cancelled      → Cancelled → log, no action
 *   payment_link.expired        → Payment link expired → log
 *   payment_link.cancelled      → Payment link cancelled → log
 *   payment_link.partially_paid → Partial payment → log
 *   (all other events)          → Acknowledge + skip
 *
 * MERCHANT ROUTING:
 * Multi-tenant — one endpoint serves all merchants. We identify the correct
 * merchant by trying HMAC-SHA256 signature verification against each active
 * Razorpay connection's webhook secret. The one that succeeds is the right merchant.
 * This avoids storing Razorpay account_id separately.
 *
 * WHY NOT USE @fynback/shared:
 * The shared package has a TypeScript compilation issue in this monorepo setup.
 * Normalization is inlined here instead.
 */

import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createDb, gatewayConnections, failedPayments, recoveryJobs, merchants, eq, and, isNull } from '@fynback/db';
import { cacheDelete } from '@/lib/cache/redis';
import { recoveryQueue, campaignQueue } from '@fynback/queue';
import type { RetryPaymentJobData, ValidateCustomerChannelsJobData } from '@fynback/queue';
import { decrypt } from '@/lib/crypto';
import { categorizeDecline, mapPaymentMethod } from '@/lib/gateways/razorpay';
import { getRetrySchedule } from '@/lib/recovery/retry-scheduler';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Razorpay substitutes this address when the customer has no email on file.
 * It is not a real customer email — treat it as null so we don't dispatch
 * email campaigns to a Razorpay-owned inbox.
 */
const RAZORPAY_VOID_EMAIL = 'void@razorpay.com';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NormalizedPayment {
  gatewayEventId: string;
  gatewayPaymentId: string | null;
  gatewayOrderId: string | null;
  gatewaySubscriptionId: string | null;
  gatewayCustomerId: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerName: string | null;
  amountPaise: number;
  currency: string;
  paymentMethodType: ReturnType<typeof mapPaymentMethod>;
  declineCode: string | null;
  declineCategory: ReturnType<typeof categorizeDecline>;
  isRecoverable: boolean;
  failedAt: Date;
  rawPayload: unknown;
}

const MAX_RETRIES: Record<string, number> = {
  upi_autopay: 3,
  credit_card: 3,
  debit_card: 3,
  net_banking: 0,
  wallet: 1,
  emi: 0,
};

// ─── Contact Channel ──────────────────────────────────────────────────────────

type ContactChannel = 'email' | 'phone' | 'both' | 'none';

function getContactChannel(email: string | null, phone: string | null): ContactChannel {
  const hasEmail = !!email;
  const hasPhone = !!phone;
  if (hasEmail && hasPhone) return 'both';
  if (hasEmail) return 'email';
  if (hasPhone) return 'phone';
  return 'none';
}

// ─── Signature Verification ───────────────────────────────────────────────────

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  try {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const signatureBuf = Buffer.from(signature, 'hex');
    if (expectedBuf.length !== signatureBuf.length) return false;
    return timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
}

// ─── Normalize payment.failed payload ────────────────────────────────────────

function normalizePaymentFailed(
  payload: Record<string, any>,
  eventId: string
): NormalizedPayment | null {
  const payment = payload?.payload?.payment?.entity;
  if (!payment) return null;

  const method = payment.method ?? 'card';
  const p = {
    id: payment.id,
    order_id: payment.order_id ?? null,
    subscription_id: payment.subscription_id ?? null,
    customer_id: payment.customer_id ?? null,
    email: payment.email && payment.email !== RAZORPAY_VOID_EMAIL ? payment.email : null,
    contact: payment.contact ?? null,
    amount: payment.amount ?? 0,
    currency: payment.currency ?? 'INR',
    method,
    card: payment.card ?? null,
    status: payment.status,
    error_code: payment.error_code ?? null,
    error_description: payment.error_description ?? null,
    error_reason: payment.error_reason ?? null,
    error_source: payment.error_source ?? null,
    error_step: payment.error_step ?? null,
    created_at: payment.created_at ?? Math.floor(Date.now() / 1000),
    description: payment.description ?? null,
    notes: payment.notes ?? {},
  } as const;

  const declineCategory = categorizeDecline(p);
  const isRecoverable =
    declineCategory !== 'hard_decline' && method !== 'net_banking';

  return {
    gatewayEventId: eventId || payment.id,
    gatewayPaymentId: payment.id,
    gatewayOrderId: p.order_id,
    gatewaySubscriptionId: p.subscription_id,
    gatewayCustomerId: p.customer_id,
    customerEmail: p.email,
    customerPhone: p.contact,
    customerName: null,
    amountPaise: p.amount,
    currency: p.currency,
    paymentMethodType: mapPaymentMethod(p),
    declineCode: p.error_code,
    declineCategory,
    isRecoverable,
    failedAt: new Date(p.created_at * 1000),
    rawPayload: payload,
  };
}

// ─── Normalize subscription.halted payload ────────────────────────────────────

function normalizeSubscriptionHalted(
  payload: Record<string, any>,
  eventId: string
): NormalizedPayment | null {
  const sub = payload?.payload?.subscription?.entity;
  if (!sub) return null;

  // If the payload also has a payment entity (last failed charge), use it
  const payment = payload?.payload?.payment?.entity;
  if (payment) return normalizePaymentFailed({ ...payload, payload: { payment: { entity: payment } } }, eventId);

  // No payment entity — create a recovery record from subscription data
  return {
    gatewayEventId: eventId || `sub_halted_${sub.id}`,
    gatewayPaymentId: null,
    gatewayOrderId: null,
    gatewaySubscriptionId: sub.id,
    gatewayCustomerId: sub.customer_id ?? null,
    customerEmail: null,
    customerPhone: null,
    customerName: null,
    amountPaise: 0, // Unknown without a plan lookup
    currency: 'INR',
    paymentMethodType: 'credit_card',
    declineCode: 'subscription_halted',
    declineCategory: 'soft_decline',
    isRecoverable: true,
    failedAt: new Date(),
    rawPayload: payload,
  };
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Must read raw body BEFORE any parsing — signature is over the raw string
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature');
  const eventId =
    request.headers.get('x-razorpay-event-id') ??
    request.headers.get('x-webhook-id') ??
    '';

  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Razorpay-Signature' }, { status: 401 });
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const event = payload.event as string | undefined;
  if (!event) {
    return NextResponse.json({ received: true, skipped: true, reason: 'No event field' });
  }

  // ── Find the merchant by trying each active Razorpay connection ─────────────
  // Multi-tenant routing: scan all connections, verify HMAC. O(N merchants) but
  // fast in practice since webhook secrets are short and HMAC is cheap.
  const db = createDb(process.env.DATABASE_URL!);

  const allConnections = await db
    .select({
      id: gatewayConnections.id,
      merchantId: gatewayConnections.merchantId,
      testMode: gatewayConnections.testMode,
      webhookSecretEncrypted: gatewayConnections.webhookSecretEncrypted,
    })
    .from(gatewayConnections)
    .where(
      and(
        eq(gatewayConnections.gatewayName, 'razorpay'),
        eq(gatewayConnections.isActive, true),
        isNull(gatewayConnections.disconnectedAt)
      )
    );

  let matchedConnection: (typeof allConnections)[0] | null = null;
  let webhookSecret = '';

  for (const conn of allConnections) {
    if (!conn.webhookSecretEncrypted) continue;
    try {
      const secret = decrypt(conn.webhookSecretEncrypted);
      if (verifySignature(rawBody, signature, secret)) {
        matchedConnection = conn;
        webhookSecret = secret;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!matchedConnection) {
    // No matching connection → unknown signature. Return 401 to flag it.
    console.error(`[Razorpay Webhook] Signature verification failed for event "${event}". ` +
      `Tried ${allConnections.length} connection(s). Check webhook secret configuration.`);
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  const { merchantId, testMode } = matchedConnection;

  // Update last-received timestamp (fire-and-forget)
  db.update(gatewayConnections)
    .set({ lastWebhookReceivedAt: new Date(), updatedAt: new Date() })
    .where(eq(gatewayConnections.id, matchedConnection.id))
    .catch(console.error);

  // ── Route by event type ─────────────────────────────────────────────────────

  // Log-only events — acknowledge but no recovery action
  const LOG_ONLY_EVENTS = [
    'subscription.paused',
    'subscription.resumed',
    'subscription.activated',
    'subscription.pending',
    'subscription.charged',
    'subscription.completed',
    'subscription.updated',
    'subscription.authenticated',
    'payment_link.paid',
    'payment_link.partially_paid',
    'payment_link.expired',
    'payment_link.cancelled',
    'payment.authorized',
    'payment.captured',
    'order.paid',
    'settlement.processed',
  ];

  if (LOG_ONLY_EVENTS.includes(event)) {
    console.log(`[Razorpay Webhook] merchant=${merchantId} event=${event} — acknowledged, no action`);
    return NextResponse.json({ received: true, event, action: 'logged' });
  }

  // Normalise the event into a failed payment record
  let normalized: NormalizedPayment | null = null;

  if (event === 'payment.failed') {
    normalized = normalizePaymentFailed(payload, eventId);
  } else if (event === 'subscription.halted') {
    normalized = normalizeSubscriptionHalted(payload, eventId);
  } else if (event === 'subscription.cancelled') {
    // No recovery — just acknowledge
    console.log(`[Razorpay Webhook] merchant=${merchantId} subscription.cancelled — acknowledged`);
    return NextResponse.json({ received: true, event, action: 'logged' });
  } else {
    // Unknown event — acknowledge without processing
    return NextResponse.json({ received: true, event, action: 'skipped', reason: 'Unsupported event' });
  }

  if (!normalized) {
    return NextResponse.json({ received: true, event, action: 'skipped', reason: 'Could not parse payload' });
  }

  // Skip test-mode connections in production — never trigger real recovery
  // Allow in dev so you can test the full flow with ngrok + test keys
  if (testMode && process.env.NODE_ENV === 'production') {
    console.log(`[Razorpay Webhook] merchant=${merchantId} event=${event} — test mode, skipped`);
    return NextResponse.json({ received: true, event, action: 'skipped', reason: 'Test mode' });
  }

  // ── Insert failed payment (idempotent) ──────────────────────────────────────
  const maxRetries = MAX_RETRIES[normalized.paymentMethodType] ?? 3;

  const [inserted] = await db
    .insert(failedPayments)
    .values({
      merchantId,
      gatewayConnectionId: matchedConnection.id,
      gatewayName: 'razorpay',
      gatewayEventId: normalized.gatewayEventId,
      gatewayPaymentId: normalized.gatewayPaymentId,
      gatewayOrderId: normalized.gatewayOrderId,
      gatewaySubscriptionId: normalized.gatewaySubscriptionId,
      gatewayCustomerId: normalized.gatewayCustomerId,
      customerEmail: normalized.customerEmail,
      customerPhone: normalized.customerPhone,
      amountPaise: normalized.amountPaise,
      currency: normalized.currency,
      paymentMethodType: normalized.paymentMethodType as any,
      declineCode: normalized.declineCode,
      declineCategory: normalized.declineCategory as any,
      isRecoverable: normalized.isRecoverable,
      status: 'just_failed',
      retryCount: 0,
      maxRetries,
      failedAt: normalized.failedAt,
      rawPayload: normalized.rawPayload as any,
    })
    .onConflictDoNothing({ target: failedPayments.gatewayEventId })
    .returning({ id: failedPayments.id });

  if (!inserted) {
    // Duplicate webhook delivery — already processed
    return NextResponse.json({ received: true, event, action: 'duplicate' });
  }

  // Bust the payments + KPI dashboard cache so the new failure appears immediately
  // (don't await — cache invalidation is best-effort; it must not block the webhook response)
  Promise.allSettled([
    cacheDelete(`payments:${merchantId}:recent:6`),
    cacheDelete(`payments:${merchantId}:recent:10`),
    cacheDelete(`payments:${merchantId}:recent:50`),
    cacheDelete(`kpis:${merchantId}`),
  ]).catch(() => {});

  // ── Dispatch recovery jobs ──────────────────────────────────────────────────
  const contactChannel = getContactChannel(normalized.customerEmail, normalized.customerPhone);

  // No way to reach this customer — mark cancelled and stop.
  if (contactChannel === 'none') {
    await db
      .update(failedPayments)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(failedPayments.id, inserted.id));
    console.log(`[Razorpay Webhook] merchant=${merchantId} payment=${inserted.id} — no contact info, cancelled`);
    return NextResponse.json({ received: true, event, failedPaymentId: inserted.id, action: 'no_contact' });
  }

  // Get merchant plan so the campaign worker picks the right system-default template.
  const merchantRow = await db
    .select({ plan: merchants.plan })
    .from(merchants)
    .where(eq(merchants.id, merchantId))
    .limit(1);
  const planRequired = merchantRow[0]?.plan ?? 'trial';

  // ── Job 1: Start the dunning campaign sequence (always) ─────────────────────
  // validate_customer_channels → schedule_campaign → execute_campaign_step × N
  // This is the primary outreach path: email + WhatsApp/SMS with proper DB tracking.
  await campaignQueue.add(
    'validate_customer_channels',
    {
      type: 'validate_customer_channels',
      failedPaymentId: inserted.id,
      merchantId,
      customerEmail: normalized.customerEmail ?? undefined,
      customerPhone: normalized.customerPhone ?? undefined,
      customerName: normalized.customerName ?? undefined,
      gatewayCustomerId: normalized.gatewayCustomerId ?? undefined,
      amountPaise: normalized.amountPaise,
      currency: normalized.currency,
      declineCategory: normalized.declineCategory,
      planRequired,
    } satisfies ValidateCustomerChannelsJobData,
    { priority: 1 }
  );

  // ── Job 2: Schedule gateway auto-retry (only for retryable subscription payments) ──
  // Runs in parallel with the campaign. If retry succeeds, it cancels the campaign run.
  // Not applicable for: hard declines, net_banking (no retry API), phone-only contacts.
  const canAutoRetry = normalized.isRecoverable
    && normalized.paymentMethodType !== 'net_banking'
    && contactChannel !== 'phone';  // Phone-only: no email to send payment link — campaign handles it

  if (canAutoRetry) {
    const retrySchedule = getRetrySchedule(
      normalized.paymentMethodType,
      normalized.declineCategory,
      1,
      new Date()
    );

    const job = await recoveryQueue.add(
      'retry_payment',
      {
        type: 'retry_payment',
        failedPaymentId: inserted.id,
        merchantId,
        recoveryJobDbId: '',
        amountPaise: normalized.amountPaise,
        currency: normalized.currency,
        customerEmail: normalized.customerEmail ?? undefined,
        customerPhone: normalized.customerPhone ?? undefined,
        customerName: normalized.customerName ?? undefined,
        gatewayName: 'razorpay',
        gatewayPaymentId: normalized.gatewayPaymentId ?? '',
        gatewaySubscriptionId: normalized.gatewaySubscriptionId ?? undefined,
        stepNumber: 1,
        attemptNumber: 1,
        paymentMethodType: normalized.paymentMethodType,
        isRecoverable: normalized.isRecoverable,
      } satisfies RetryPaymentJobData,
      { delay: retrySchedule.delayMs, priority: 1 }
    );

    await db.insert(recoveryJobs).values({
      failedPaymentId: inserted.id,
      merchantId,
      bullmqJobId: job.id,
      jobType: 'retry_payment',
      status: 'pending',
      attemptNumber: 1,
      scheduledAt: new Date(Date.now() + retrySchedule.delayMs),
    });

    await db
      .update(failedPayments)
      .set({ status: 'retry_scheduled', nextRetryAt: new Date(Date.now() + retrySchedule.delayMs) })
      .where(eq(failedPayments.id, inserted.id));
  }

  console.log(
    `[Razorpay Webhook] merchant=${merchantId} payment=${inserted.id} — ` +
    `campaign started, retry=${canAutoRetry}`
  );
  return NextResponse.json({ received: true, event, failedPaymentId: inserted.id });
}

