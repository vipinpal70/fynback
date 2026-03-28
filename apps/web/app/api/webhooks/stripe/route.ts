/**
 * app/api/webhooks/stripe/route.ts
 *
 * Stripe webhook endpoint.
 *
 * CRITICAL DIFFERENCE FROM RAZORPAY:
 * Stripe's signature verification requires a Buffer (raw bytes), NOT a string.
 * Specifically, stripe.webhooks.constructEvent() needs the raw body as received
 * by the server — before any encoding transformation.
 *
 * HOW TO READ RAW BODY IN NEXT.JS 14 APP ROUTER:
 *   request.arrayBuffer() → Buffer (use this for Stripe)
 *   request.text()        → string (use this for Razorpay)
 *
 * WHY NOT request.json()?
 * JSON.parse → JSON.stringify changes whitespace, key ordering, and number precision.
 * The signature computed by Stripe was over the ORIGINAL bytes. Any transformation
 * invalidates the signature. Always use arrayBuffer() for Stripe.
 *
 * SUPPORTED EVENTS:
 *   invoice.payment_failed  → Subscription renewal failure (most important)
 *   charge.failed           → One-time payment failure
 *
 * STRIPE WEBHOOK SETUP:
 * In your Stripe Dashboard → Webhooks → Add endpoint:
 *   URL: https://yourdomain.com/api/webhooks/stripe
 *   Events: invoice.payment_failed, charge.failed
 * Store the signing secret in STRIPE_WEBHOOK_SECRET env var.
 */

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { normalizeWebhook } from '@fynback/shared';
import { createDb, paymentQueries, merchants, failedPayments, eq } from '@fynback/db';
import { cacheDelete } from '@/lib/cache/redis';
import { recoveryQueue, campaignQueue } from '@fynback/queue';
import type { RetryPaymentJobData, ValidateCustomerChannelsJobData } from '@fynback/queue';
import { getRetrySchedule } from '@/lib/recovery/retry-scheduler';
import { getMerchantIdFromStripeCustomer } from '@/lib/recovery/gateway-helpers';

/**
 * Max retries per payment method type.
 * Mirrors the Razorpay webhook handler — kept in sync.
 * WHY DUPLICATED: Each webhook route is independent. Sharing a constant would
 * require another package; the duplication is intentional to keep routes self-contained.
 */
const MAX_RETRIES: Record<string, number> = {
  upi_autopay: 3,
  credit_card: 3,
  debit_card: 3,
  net_banking: 0,
  wallet: 1,
  emi: 0,
};

type ContactChannel = 'email' | 'phone' | 'both' | 'none';

function getContactChannel(email: string | null | undefined, phone: string | null | undefined): ContactChannel {
  const hasEmail = !!email;
  const hasPhone = !!phone;
  if (hasEmail && hasPhone) return 'both';
  if (hasEmail) return 'email';
  if (hasPhone) return 'phone';
  return 'none';
}

export async function POST(request: Request) {
  // ── Step 1: Read raw body as ArrayBuffer ───────────────────────────────────
  // WHY ArrayBuffer (not text())?
  // Stripe's SDK computes the HMAC over the raw bytes of the request body.
  // Using text() applies UTF-8 encoding which can alter bytes for certain Unicode
  // sequences. arrayBuffer() gives us the original bytes, making verification reliable.
  const rawBodyBuffer = await request.arrayBuffer();
  const rawBodyForStripe = Buffer.from(rawBodyBuffer);

  // ── Step 2: Get Stripe signature from header ───────────────────────────────
  const stripeSignature = request.headers.get('stripe-signature');

  if (!stripeSignature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 401 }
    );
  }

  // ── Step 3: Verify signature and parse event using Stripe SDK ─────────────
  // WHY USE STRIPE SDK HERE (vs. manual HMAC like Razorpay)?
  // Stripe's constructEvent() does more than just verify the signature:
  //   1. It validates the timestamp in the signature to prevent replay attacks
  //      (Stripe rejects webhooks with timestamps older than 300 seconds).
  //   2. It handles the specific Stripe signature format (v1=timestamp+signature).
  // Writing this manually would be error-prone and miss the replay protection.
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET env var not set');
    return NextResponse.json(
      { received: true, skipped: true, reason: 'Webhook secret not configured' },
      { status: 200 } // Still 200 — don't cause Stripe to retry
    );
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-02-25.clover',
  });

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      rawBodyForStripe,
      stripeSignature,
      webhookSecret
    );
  } catch (err) {
    // constructEvent throws if signature is invalid OR timestamp is too old
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[Stripe Webhook] Signature verification failed: ${message}`);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 401 }
    );
  }

  // ── Step 4: Skip test mode events ─────────────────────────────────────────
  // WHY: Stripe sends both live and test webhooks to the same endpoint if configured
  // that way. Test events must never trigger real recovery campaigns.
  // Block test events in production — allow in dev so you can test with ngrok + test keys
  if (!stripeEvent.livemode && process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { received: true, skipped: true, reason: 'Test mode event ignored' },
      { status: 200 }
    );
  }

  // ── Step 5: Parse body as JSON for normalization ───────────────────────────
  // WHY PARSE SEPARATELY: We already verified the signature above (good).
  // Now we need the parsed JSON object for the normalizer.
  const rawPayload = JSON.parse(rawBodyForStripe.toString('utf-8')) as Record<string, unknown>;

  // ── Step 6: Normalize to unified format ───────────────────────────────────
  const normalizeResult = normalizeWebhook('stripe', rawPayload, stripeEvent.id);

  if (normalizeResult.skip) {
    return NextResponse.json(
      { received: true, skipped: true, reason: normalizeResult.reason },
      { status: 200 }
    );
  }

  const normalized = normalizeResult.data;

  // ── Step 7: Find the merchant from the Stripe customer ID ─────────────────
  // WHY DIFFERENT FROM RAZORPAY:
  // Razorpay sends account_id (their internal account ID = our merchant identifier).
  // Stripe sends customer.id inside the event. We look up which of our merchants
  // owns this Stripe customer ID.
  const db = createDb(process.env.DATABASE_URL!);
  const merchantId = await getMerchantIdFromStripeCustomer(
    db,
    normalized.gatewayCustomerId!
  );

  if (!merchantId) {
    // Unknown Stripe customer — not one of our merchants (or they disconnected)
    return NextResponse.json(
      { received: true, skipped: true, reason: 'Unknown Stripe customer ID' },
      { status: 200 }
    );
  }

  // ── Step 8: Insert failed payment (idempotent) ────────────────────────────
  const maxRetries = MAX_RETRIES[normalized.paymentMethodType] ?? 3;

  const failedPayment = await paymentQueries.insertFailedPayment(db, {
    merchantId,
    normalized,
    maxRetries,
  });

  if (!failedPayment) {
    // Duplicate — already processed this event
    return NextResponse.json(
      { received: true, skipped: true, reason: 'Duplicate event — already processed' },
      { status: 200 }
    );
  }

  // Bust dashboard cache so the new failure appears immediately (fire-and-forget)
  Promise.allSettled([
    cacheDelete(`payments:${merchantId}:recent:6`),
    cacheDelete(`payments:${merchantId}:recent:10`),
    cacheDelete(`payments:${merchantId}:recent:50`),
    cacheDelete(`kpis:${merchantId}`),
  ]).catch(() => {});

  // ── Step 9: Dispatch recovery jobs ────────────────────────────────────────
  const contactChannel = getContactChannel(normalized.customerEmail, normalized.customerPhone);

  // No way to reach this customer — mark cancelled and stop.
  if (contactChannel === 'none') {
    await db
      .update(failedPayments)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(failedPayments.id, failedPayment.id));
    console.log(`[Stripe Webhook] merchant=${merchantId} payment=${failedPayment.id} — no contact info, cancelled`);
    return NextResponse.json({ received: true, failedPaymentId: failedPayment.id, action: 'no_contact' });
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
  await campaignQueue.add(
    'validate_customer_channels',
    {
      type: 'validate_customer_channels',
      failedPaymentId: failedPayment.id,
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
    && contactChannel !== 'phone';

  if (canAutoRetry) {
    const retrySchedule = getRetrySchedule(
      normalized.paymentMethodType,
      normalized.declineCategory,
      1,
      new Date()
    );

    const retryJob = await recoveryQueue.add(
      'retry_payment',
      {
        type: 'retry_payment',
        failedPaymentId: failedPayment.id,
        merchantId,
        recoveryJobDbId: '',
        amountPaise: normalized.amountPaise,
        currency: normalized.currency,
        customerEmail: normalized.customerEmail ?? undefined,
        customerPhone: normalized.customerPhone ?? undefined,
        customerName: normalized.customerName ?? undefined,
        gatewayName: normalized.gatewayName,
        gatewayPaymentId: normalized.gatewayPaymentId,
        gatewaySubscriptionId: normalized.gatewaySubscriptionId ?? undefined,
        stepNumber: 1,
        attemptNumber: 1,
        paymentMethodType: normalized.paymentMethodType,
        isRecoverable: normalized.isRecoverable,
      } satisfies RetryPaymentJobData,
      { delay: retrySchedule.delayMs, priority: 1 }
    );

    await paymentQueries.insertRecoveryJob(db, {
      failedPaymentId: failedPayment.id,
      merchantId,
      bullmqJobId: retryJob.id,
      jobType: 'retry_payment',
      attemptNumber: 1,
      scheduledAt: new Date(Date.now() + retrySchedule.delayMs),
    });

    await paymentQueries.updateFailedPaymentStatus(db, failedPayment.id, {
      status: 'retry_scheduled',
      nextRetryAt: new Date(Date.now() + retrySchedule.delayMs),
    });
  }

  console.log(
    `[Stripe Webhook] merchant=${merchantId} payment=${failedPayment.id} — ` +
    `campaign started, retry=${canAutoRetry}`
  );
  return NextResponse.json({ received: true, failedPaymentId: failedPayment.id });
}
