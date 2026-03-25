/**
 * normalizer/index.ts
 *
 * Public API for the payment normalizer module.
 *
 * WHY THIS FILE EXISTS:
 * Callers (webhook routes) import from '@fynback/shared/normalizer' or
 * '@fynback/shared'. They shouldn't need to know which gateway file to import —
 * they just call normalizeWebhook(gatewayName, payload) and get a result back.
 *
 * This file provides the single dispatch function + re-exports the individual
 * normalizers for cases where callers need direct access.
 */

export { normalizeRazorpayWebhook } from './razorpay.normalizer';
export { normalizeStripeWebhook } from './stripe.normalizer';
export { normalizeCashfreeWebhook } from './cashfree.normalizer';
export { normalizePayUWebhook } from './payu.normalizer';

import type { GatewayName, NormalizerResult } from '../types/payment.types';
import { normalizeRazorpayWebhook } from './razorpay.normalizer';
import { normalizeStripeWebhook } from './stripe.normalizer';
import { normalizeCashfreeWebhook } from './cashfree.normalizer';
import { normalizePayUWebhook } from './payu.normalizer';

/**
 * Unified gateway dispatch — normalizes any gateway's webhook payload.
 *
 * This is the primary function webhook routes should call.
 * It routes to the correct normalizer based on the gateway name,
 * keeping webhook route handlers clean and gateway-agnostic.
 *
 * @param gateway    - Which gateway sent this webhook
 * @param rawPayload - Parsed JSON body of the webhook
 * @param eventId    - Gateway-assigned event ID (for idempotency)
 *                     Razorpay sends this in X-Razorpay-Event-Id header.
 *                     Stripe includes it as event.id inside the payload.
 *
 * @example
 *   const result = normalizeWebhook('razorpay', body, header['x-razorpay-event-id']);
 *   if (!result.skip) {
 *     await insertFailedPayment(result.data);
 *   }
 */
export function normalizeWebhook(
  gateway: GatewayName,
  rawPayload: Record<string, unknown>,
  eventId: string
): NormalizerResult {
  switch (gateway) {
    case 'razorpay':
      // Razorpay eventId comes from X-Razorpay-Event-Id header
      return normalizeRazorpayWebhook(rawPayload, eventId);

    case 'stripe':
      // Stripe eventId is inside the payload as event.id — normalizer extracts it
      // The eventId parameter is passed for consistency but may be ignored internally
      return normalizeStripeWebhook(rawPayload);

    case 'cashfree':
      return normalizeCashfreeWebhook(rawPayload);

    case 'payu':
      return normalizePayUWebhook(rawPayload);

    default: {
      // TypeScript exhaustiveness check — this should never happen at runtime
      const exhaustiveCheck: never = gateway;
      return {
        skip: true,
        reason: `Unknown gateway: ${exhaustiveCheck}. No normalizer available.`,
      };
    }
  }
}
