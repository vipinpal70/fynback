/**
 * cashfree.normalizer.ts
 *
 * Converts Cashfree webhook payloads into our unified NormalizedFailedPayment format.
 *
 * STATUS: STUB — not yet fully implemented.
 *
 * WHY A STUB EXISTS (not just skip everything)?
 * Having the file in place means:
 *   1. The webhook route can import it without crashing.
 *   2. Cashfree webhooks return 200 OK (preventing Cashfree from retrying endlessly).
 *   3. When we implement it, the integration point already exists — no route changes needed.
 *
 * WHEN TO IMPLEMENT:
 * Cashfree is the 3rd largest Indian gateway (after Razorpay and PayU).
 * It's popular with D2C brands for UPI payment links. Implement when you onboard
 * your first Cashfree merchant.
 *
 * CASHFREE PAYMENT FAILURE EVENTS:
 *   PAYMENT_FAILED      → Direct payment failure (equivalent to Razorpay payment.failed)
 *   SUBSCRIPTION_FAILED → Subscription payment failure
 *
 * REFERENCE:
 * https://docs.cashfree.com/docs/webhook-events
 * https://docs.cashfree.com/docs/payment-gateway-webhooks
 */

import type { NormalizerResult } from '../types/payment.types';

/**
 * Normalizes a Cashfree webhook payload.
 *
 * Currently returns skip:true for ALL events until the normalizer is implemented.
 * WHY: A partial implementation would be worse than no implementation — it might
 * silently misclassify payments or create recovery jobs with wrong data.
 * Better to skip all Cashfree events and implement correctly when ready.
 *
 * @param rawPayload - The parsed Cashfree webhook body
 */
export function normalizeCashfreeWebhook(
  rawPayload: Record<string, unknown>
): NormalizerResult {
  // TODO: Implement Cashfree normalizer
  // Steps to implement:
  //   1. Identify event type from rawPayload.type or rawPayload.event
  //   2. Extract payment entity from rawPayload.data.payment
  //   3. Map Cashfree error codes to DeclineCategory (see Cashfree error code docs)
  //   4. Convert amount from Cashfree format (they use rupees, not paise) to paise
  //   5. Extract customer email/phone from rawPayload.data.customer_details
  //   6. Return NormalizerResult with skip:false and the normalized data

  const eventType = (rawPayload.type as string) ?? 'unknown';

  return {
    skip: true,
    reason: `Cashfree normalizer not yet implemented. Received event: ${eventType}. Skipping recovery workflow.`,
  };
}
