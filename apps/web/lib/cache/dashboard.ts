/**
 * lib/cache/dashboard.ts
 *
 * Redis-cached data fetchers for the dashboard.
 *
 * PATTERN: Every function checks Redis first → on miss, queries DB → stores in Redis.
 * This means the first load hits the DB (cold cache), subsequent loads are Redis-fast (<20ms).
 *
 * CACHE TTLs:
 *   kpis:          5min  — KPIs update frequently as payments come in
 *   payments:      2min  — Recent payments table refreshes frequently
 *   analytics:     1h    — Historical chart data changes only via daily cron
 *   gateways:      10min — Gateway status doesn't change second-to-second
 *   merchantId:    30min — Clerk userId→merchantId mapping is stable
 *
 * WHY PER-MERCHANT KEYS (not shared)?
 * Each merchant's data is completely isolated. Shared keys would mix data across tenants.
 * Format: "{resource}:{merchantId}" — consistent pattern for bulk invalidation.
 */

import { cacheGetOrSet } from './redis';
import { createDb, paymentQueries } from '@fynback/db';
import type { Database } from '@fynback/db';

// ─── Types returned to the dashboard ───────────────────────────────────────

export interface DashboardKpis {
  totalRecoveredPaise: number;
  totalFailedPaise: number;
  totalAtRiskPaise: number;
  recoveryRatePct: number;       // 0–100
  failedCount: number;
  recoveredCount: number;
  activeCampaignsCount: number;  // from recovery_jobs with status=processing|pending
}

export interface RecentPayment {
  id: string;
  customerEmail: string | null;
  customerName: string | null;
  amountPaise: number;
  currency: string;
  gatewayName: string;
  declineCategory: string;
  declineCode: string | null;
  status: string;
  isRecoverable: boolean;
  failedAt: string;  // ISO string — dates lose type through JSON serialization
}

export interface GatewayStatus {
  id: string;
  gatewayName: string;
  isActive: boolean;
  testMode: boolean;
  lastWebhookAt: string | null;  // ISO string
}

export interface AnalyticsPoint {
  snapshotDate: string;
  failedAmountPaise: number;
  recoveredAmountPaise: number;
  recoveryRatePct: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getDb(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return createDb(url);
}

// ─── Cache functions ─────────────────────────────────────────────────────────

/**
 * Live KPI numbers for the dashboard header cards.
 * Aggregates directly from failed_payments table for real-time accuracy.
 *
 * TTL: 5 minutes — balance between freshness and DB load.
 * In production with high volume, consider shortening to 1-2min.
 */
export async function getDashboardKpis(merchantId: string): Promise<DashboardKpis> {
  return cacheGetOrSet(
    `kpis:${merchantId}`,
    5 * 60, // 5 minutes
    async () => {
      const db = getDb();
      const raw = await paymentQueries.getLiveDashboardKpis(db, merchantId);

      if (!raw) {
        return {
          totalRecoveredPaise: 0,
          totalFailedPaise: 0,
          totalAtRiskPaise: 0,
          recoveryRatePct: 0,
          failedCount: 0,
          recoveredCount: 0,
          activeCampaignsCount: 0,
        };
      }

      const totalAtRiskPaise = Math.max(0, raw.totalFailedPaise - raw.totalRecoveredPaise);
      const recoveryRatePct =
        raw.failedCount > 0
          ? Math.round((Number(raw.recoveredCount) / Number(raw.failedCount)) * 100)
          : 0;

      return {
        totalRecoveredPaise: Number(raw.totalRecoveredPaise),
        totalFailedPaise: Number(raw.totalFailedPaise),
        totalAtRiskPaise,
        recoveryRatePct,
        failedCount: Number(raw.failedCount),
        recoveredCount: Number(raw.recoveredCount),
        activeCampaignsCount: 0, // TODO: query recovery_jobs count
      };
    }
  );
}

/**
 * Recent failed payments for the dashboard table.
 *
 * TTL: 2 minutes — new failed payments can come in frequently.
 * Returns the N most recent for display. Full list is in /dashboard/payments.
 */
export async function getRecentPayments(
  merchantId: string,
  limit: number = 10
): Promise<RecentPayment[]> {
  return cacheGetOrSet(
    `payments:${merchantId}:recent:${limit}`,
    2 * 60, // 2 minutes
    async () => {
      const db = getDb();
      const rows = await paymentQueries.getRecentFailedPayments(db, merchantId, limit);

      // Convert Date objects to ISO strings (required for JSON serialization)
      return rows.map((r) => ({
        id: r.id,
        customerEmail: r.customerEmail ?? null,
        customerName: r.customerName ?? null,
        amountPaise: r.amountPaise,
        currency: r.currency,
        gatewayName: r.gatewayName,
        declineCategory: r.declineCategory,
        declineCode: r.declineCode ?? null,
        status: r.status,
        isRecoverable: r.isRecoverable,
        failedAt: r.failedAt.toISOString(),
      }));
    }
  );
}

/**
 * Last 30 days of analytics snapshots for the recovery trend chart.
 *
 * TTL: 1 hour — updated by the daily analytics cron.
 * Today's data is approximated from getLiveDashboardKpis; historical is snapshots.
 */
export async function getAnalyticsHistory(
  merchantId: string,
  days: number = 30
): Promise<AnalyticsPoint[]> {
  return cacheGetOrSet(
    `analytics:${merchantId}:${days}d`,
    60 * 60, // 1 hour
    async () => {
      const db = getDb();
      const rows = await paymentQueries.getAnalyticsHistory(db, merchantId, days);

      return rows.map((r) => ({
        snapshotDate: r.snapshotDate,
        failedAmountPaise: r.failedAmountPaise,
        recoveredAmountPaise: r.recoveredAmountPaise,
        recoveryRatePct: r.recoveryRatePct,
      }));
    }
  );
}

/**
 * Active gateway connections for a merchant.
 *
 * TTL: 10 minutes — gateway status changes only via explicit user action.
 * We also call cacheDelete on this key when gateways are connected/disconnected.
 */
export async function getGatewayStatuses(merchantId: string): Promise<GatewayStatus[]> {
  return cacheGetOrSet(
    `gateways:${merchantId}`,
    10 * 60, // 10 minutes
    async () => {
      const db = getDb();

      // Query all gateway connections for this merchant
      const gateways: GatewayStatus[] = [];
      for (const gw of ['razorpay', 'stripe', 'cashfree', 'payu'] as const) {
        const conn = await paymentQueries.getActiveGatewayConnection(db, merchantId, gw);
        if (conn) {
          gateways.push({
            id: conn.id,
            gatewayName: conn.gatewayName,
            isActive: conn.isActive,
            testMode: conn.testMode,
            lastWebhookAt: conn.lastWebhookReceivedAt?.toISOString() ?? null,
          });
        }
      }

      return gateways;
    }
  );
}
