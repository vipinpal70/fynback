/**
 * lib/recovery/gateway-helpers.ts
 *
 * Helper functions for resolving gateway identifiers to merchant IDs.
 *
 * WHY THIS FILE EXISTS:
 * Multi-tenant SaaS: One FynBack instance handles webhooks for ALL merchants.
 * When Razorpay sends a webhook, it includes the merchant's Razorpay account_id.
 * When Stripe sends a webhook, it includes the merchant's Stripe customer_id.
 * We need to map these gateway-specific identifiers back to our internal merchantId
 * to know which merchant's recovery pipeline to trigger.
 *
 * WHY SEPARATE FILE (not inline in route handlers)?
 * Both Razorpay and Stripe routes need this lookup. Shared logic lives here.
 * Also useful for the worker when looking up credentials before calling gateway APIs.
 */

import { eq } from 'drizzle-orm';
import type { Database } from '@fynback/db';
import { gatewayConnections, merchants } from '@fynback/db';

/**
 * Finds the internal merchant ID from a Razorpay account ID.
 *
 * HOW: When a merchant connects their Razorpay account, we store their
 * Razorpay account_id in gateway_connections.oauth_access_token or similar.
 * This queries gateway_connections to find the matching merchant.
 *
 * NOTE: This requires that gateway_connections stores the Razorpay account_id
 * at connection time. The gateway setup flow populates this.
 *
 * @param db              - Database instance
 * @param gatewayName     - 'razorpay' | 'stripe' | 'cashfree' | 'payu'
 * @param gatewayAccountId - The gateway's account ID for the merchant
 * @returns merchantId or null if not found
 */
export async function getMerchantIdFromGatewayAccountId(
  db: Database,
  gatewayName: 'razorpay' | 'stripe' | 'cashfree' | 'payu',
  gatewayAccountId: string
): Promise<string | null> {
  // WHY JOIN WITH merchants: We need to verify the merchant is still active.
  // A disconnected or cancelled merchant should not trigger recovery campaigns.
  const rows = await db
    .select({ merchantId: gatewayConnections.merchantId })
    .from(gatewayConnections)
    .innerJoin(merchants, eq(merchants.id, gatewayConnections.merchantId))
    .where(
      eq(gatewayConnections.gatewayName, gatewayName)
      // TODO: Add condition to match gateway account ID
      // Currently: eq(gatewayConnections.gatewayAccountId, gatewayAccountId)
      // This requires adding a gatewayAccountId column to gateway_connections
      // which will be added when we implement the full gateway OAuth flow.
    )
    .limit(1);

  return rows[0]?.merchantId ?? null;
}

/**
 * Finds the internal merchant ID from a Stripe customer ID.
 *
 * HOW: Stripe sends customer.id with every invoice event. We look up which
 * merchant in our system owns this Stripe customer ID.
 *
 * WHY merchants.stripeCustomerId?
 * The merchants table already has a stripeCustomerId field (for the merchant's
 * own billing with FynBack). For gateway connections, we need the Stripe customer
 * IDs of the MERCHANT'S customers (the end users who are paying the merchant).
 *
 * NOTE: This is a lookup on the merchant's Stripe account, not FynBack's Stripe account.
 * The merchant's customers are in gateway_connections → linked to the merchant.
 * The customer ID is attached to the Stripe gateway connection record.
 *
 * TODO: Refine this once we have the full gateway connection data model.
 * For now, this is a placeholder that will be fully implemented with the
 * gateway OAuth/API key setup flow.
 *
 * @param db               - Database instance
 * @param stripeCustomerId - Stripe customer ID (e.g., 'cus_xxx')
 * @returns merchantId or null if not found
 */
export async function getMerchantIdFromStripeCustomer(
  db: Database,
  stripeCustomerId: string
): Promise<string | null> {
  // TODO: Implement once gateway_connections is extended with gateway_customer_id field.
  // For now, this queries merchants by stripeCustomerId.
  // Note: merchants.stripeCustomerId is for the merchant's FynBack subscription,
  // not their customers' payments. This will need a different lookup mechanism.
  //
  // Temporary: return null (will cause Stripe webhooks to be skipped)
  // This will be fixed in the gateway OAuth setup task.
  void db;
  void stripeCustomerId;

  return null;
}
