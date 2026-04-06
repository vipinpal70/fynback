/**
 * lib/gateways/sync.ts
 *
 * Historical sync: fetch current-month failed payments from a gateway,
 * insert into failed_payments, enqueue campaign jobs for each new failure,
 * recompute merchant KPI stats, bust Redis cache.
 *
 * WHY CURRENT MONTH ONLY:
 * On first connect we want data fast. Fetching all-time history could mean
 * thousands of payments and many API calls. Current month gives the merchant
 * instant value without long waits.
 *
 * IDEMPOTENT: uses onConflictDoNothing on gateway_event_id unique constraint.
 * Safe to re-run at any time — won't double-count payments or double-send campaigns.
 */

import { createDb, failedPayments, merchants, eq, sql as drizzleSql } from '@fynback/db';
import { fetchFailedPayments, categorizeDecline, mapPaymentMethod } from './razorpay';
import { cacheDelete } from '@/lib/cache/redis';
import { campaignQueue } from '@fynback/queue';
import type { ValidateCustomerChannelsJobData } from '@fynback/queue';

export interface SyncResult {
  fetched: number;
  inserted: number;
  skipped: number;  // already existed or errored
}

export async function syncGatewayHistory(
  merchantId: string,
  connectionId: string,
  gatewayName: 'razorpay',
  apiKey: string,
  apiSecret: string,
  merchantPlan: string = 'trial'  // used to pick the right system default campaign
): Promise<SyncResult> {
  const db = createDb(process.env.DATABASE_URL!);

  // Sync current month (1st of month 00:00 → now)
  const now = Math.floor(Date.now() / 1000);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const fromTs = Math.floor(monthStart.getTime() / 1000);

  const payments = await fetchFailedPayments(apiKey, apiSecret, fromTs, now);

  let inserted = 0;
  let skipped = 0;

  for (const p of payments) {
    try {
      const rows = await db
        .insert(failedPayments)
        .values({
          merchantId,
          gatewayConnectionId: connectionId,
          gatewayName: gatewayName as any,
          gatewayEventId: p.id,
          gatewayPaymentId: p.id,
          gatewayOrderId: p.order_id ?? null,
          gatewaySubscriptionId: p.subscription_id ?? null,
          gatewayCustomerId: p.customer_id ?? null,
          customerEmail: p.email ?? null,
          customerPhone: p.contact ?? null,
          amountPaise: p.amount,
          currency: p.currency,
          paymentMethodType: mapPaymentMethod(p) as any,
          declineCode: p.error_code ?? null,
          declineCategory: categorizeDecline(p) as any,
          status: 'just_failed' as any,
          isRecoverable: true,
          failedAt: new Date(p.created_at * 1000),
          rawPayload: p as any,
        })
        .onConflictDoNothing()
        .returning({ id: failedPayments.id });

      if (rows.length > 0) {
        inserted++;

        // ── Trigger campaign for this historical failure ──────────────────
        // Only enqueue if we have a way to contact the customer.
        // Priority 2 (lower than live webhooks at priority 1) so real-time
        // failures are always processed first.
        const hasContact = !!(p.email || p.contact);
        if (hasContact) {
          campaignQueue
            .add(
              'validate_customer_channels',
              {
                type: 'validate_customer_channels',
                failedPaymentId: rows[0].id,
                merchantId,
                customerEmail: p.email ?? undefined,
                customerPhone: p.contact ?? undefined,
                customerName: undefined,
                gatewayCustomerId: p.customer_id ?? undefined,
                amountPaise: p.amount,
                currency: p.currency,
                declineCategory: categorizeDecline(p),
                planRequired: merchantPlan,
              } satisfies ValidateCustomerChannelsJobData,
              { priority: 2 }
            )
            .catch((err) =>
              console.error(
                `[SyncGateway] Failed to enqueue campaign for payment ${rows[0].id}:`,
                err
              )
            );
        }
      } else {
        skipped++;
      }
    } catch (err) {
      skipped++;
      if (skipped <= 3) {
        console.error(`[SyncGateway] Failed to insert payment ${p.id}:`, err);
      }
    }
  }

  // Recompute KPI stats on the merchant row
  const [stats] = await db
    .select({
      totalFailed: drizzleSql<string>`coalesce(sum(amount_paise), 0)`,
      totalRecovered: drizzleSql<string>`coalesce(sum(coalesce(recovered_amount_paise, 0)), 0)`,
      activeCount: drizzleSql<string>`count(*)::text`,
    })
    .from(failedPayments)
    .where(eq(failedPayments.merchantId, merchantId));

  const totalFailed = parseInt(stats?.totalFailed ?? '0', 10);
  const totalRecovered = parseInt(stats?.totalRecovered ?? '0', 10);
  const activeCount = parseInt(stats?.activeCount ?? '0', 10);
  const rate = totalFailed > 0 ? Math.round((totalRecovered / totalFailed) * 100) : 0;

  await db
    .update(merchants)
    .set({
      totalFailedAmountPaise: totalFailed,
      totalRecoveredAmountPaise: totalRecovered,
      recoveryRatePct: rate,
      activeFailedPaymentsCount: activeCount,
      statsLastCalculatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(merchants.id, merchantId));

  // Bust all cached dashboard data for this merchant
  await Promise.allSettled([
    cacheDelete(`kpis:${merchantId}`),
    cacheDelete(`payments:${merchantId}:recent:6`),
    cacheDelete(`payments:${merchantId}:recent:10`),
    cacheDelete(`payments:${merchantId}:recent:50`),
    cacheDelete(`analytics:${merchantId}:7d`),
    cacheDelete(`analytics:${merchantId}:30d`),
    cacheDelete(`analytics:${merchantId}:90d`),
    cacheDelete(`gateways:${merchantId}`),
    cacheDelete(`settings:merchant:${merchantId}`),
  ]);

  return { fetched: payments.length, inserted, skipped };
}
