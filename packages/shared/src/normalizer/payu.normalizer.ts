/**
 * payu.normalizer.ts
 *
 * Converts PayU webhook payloads into our unified NormalizedFailedPayment format.
 *
 * STATUS: STUB — not yet fully implemented.
 *
 * WHY A STUB EXISTS:
 * Same reason as cashfree.normalizer.ts — ensures the integration point exists
 * and Cashfree webhooks get a 200 OK response without triggering recovery logic.
 *
 * WHEN TO IMPLEMENT:
 * PayU is the 2nd largest Indian gateway, widely used by EdTech companies
 * (BYJU'S, Unacademy, etc.). Implement when you onboard your first PayU merchant.
 *
 * PAYU SPECIFICS TO KNOW BEFORE IMPLEMENTING:
 *   - PayU sends POST form-data (not JSON!) for some older webhook formats
 *   - Newer PayU S2S webhooks do send JSON
 *   - PayU amounts are in RUPEES (not paise) — must multiply by 100 to get paise
 *   - PayU's signature verification uses SHA-512 (different from Razorpay's SHA-256)
 *   - Failure event field: "status" === "failure" in the webhook body
 *
 * REFERENCE:
 * https://devguide.payu.in/payment-gateway/server-to-server-integration/
 * https://devguide.payu.in/payment-gateway/server-to-server-integration/webhook-notifications/
 */

import type { NormalizerResult } from '../types/payment.types';

/**
 * Normalizes a PayU webhook payload.
 * Currently a stub — returns skip:true for all events.
 */
export function normalizePayUWebhook(
  rawPayload: Record<string, unknown>
): NormalizerResult {
  // TODO: Implement PayU normalizer
  // Key differences from Razorpay to handle:
  //   1. PayU amounts are in RUPEES — multiply by 100 for paise
  //   2. PayU sends txnid (their transaction ID) — use as gatewayPaymentId
  //   3. Failure detection: rawPayload.status === 'failure'
  //   4. Error field: rawPayload.error_Message (note capital M — PayU quirk)
  //   5. PayU webhook signature: SHA-512 of specific field concatenation (not raw body)

  const status = (rawPayload.status as string) ?? 'unknown';

  return {
    skip: true,
    reason: `PayU normalizer not yet implemented. Received status: ${status}. Skipping recovery workflow.`,
  };
}
