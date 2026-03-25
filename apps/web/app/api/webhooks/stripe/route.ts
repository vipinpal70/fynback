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
import { createDb, paymentQueries } from '@fynback/db';
import { recoveryQueue } from '@fynback/queue';
import type { RetryPaymentJobData, SendEmailJobData } from '@fynback/queue';
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

  // ── Step 9: Dispatch recovery job ─────────────────────────────────────────
  if (!normalized.isRecoverable || normalized.paymentMethodType === 'net_banking') {
    // Non-recoverable or net banking → go straight to email
    await dispatchInitialEmailJob(db, failedPayment.id, merchantId, normalized);
  } else {
    // Recoverable → schedule auto-retry
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
        customerEmail: normalized.customerEmail,
        customerPhone: normalized.customerPhone,
        customerName: normalized.customerName,
        gatewayName: normalized.gatewayName,
        gatewayPaymentId: normalized.gatewayPaymentId,
        gatewaySubscriptionId: normalized.gatewaySubscriptionId,
        stepNumber: 1,
        attemptNumber: 1,
        paymentMethodType: normalized.paymentMethodType,
        isRecoverable: normalized.isRecoverable,
      } satisfies RetryPaymentJobData,
      {
        delay: retrySchedule.delayMs,
        priority: 1,
      }
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

  return NextResponse.json({ received: true }, { status: 200 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Initial email job for non-retryable payments
// ─────────────────────────────────────────────────────────────────────────────

async function dispatchInitialEmailJob(
  db: ReturnType<typeof createDb>,
  failedPaymentId: string,
  merchantId: string,
  normalized: Extract<ReturnType<typeof normalizeWebhook>, { skip: false }>['data']
) {
  const { merchantBrandSettings, eq } = await import('@fynback/db');

  const brandRows = await db
    .select()
    .from(merchantBrandSettings)
    .where(eq(merchantBrandSettings.merchantId, merchantId))
    .limit(1);

  const brand = brandRows[0];

  const emailJob = await recoveryQueue.add(
    'send_email',
    {
      type: 'send_email',
      failedPaymentId,
      merchantId,
      recoveryJobDbId: '',
      amountPaise: normalized.amountPaise,
      currency: normalized.currency,
      customerEmail: normalized.customerEmail,
      customerPhone: normalized.customerPhone,
      customerName: normalized.customerName,
      gatewayName: normalized.gatewayName,
      gatewayPaymentId: normalized.gatewayPaymentId,
      gatewaySubscriptionId: normalized.gatewaySubscriptionId,
      stepNumber: 1,
      merchantFromName: brand?.fromName ?? 'FynBack Recovery',
      merchantFromEmail: brand?.fromEmail ?? 'recovery@fynback.com',
      merchantReplyTo: brand?.replyToEmail ?? 'support@fynback.com',
      merchantBrandColor: brand?.brandColorHex ?? '#00e878',
      includePauseOffer: false,
    } satisfies SendEmailJobData,
    { priority: 2 }
  );

  await paymentQueries.insertRecoveryJob(db, {
    failedPaymentId,
    merchantId,
    bullmqJobId: emailJob.id,
    jobType: 'send_email',
    attemptNumber: 1,
    scheduledAt: new Date(),
  });
}
