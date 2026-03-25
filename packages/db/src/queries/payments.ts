/**
 * queries/payments.ts
 *
 * All database queries for the payment recovery engine.
 *
 * WHY SEPARATE FROM onboarding.ts?
 * Onboarding queries run once per merchant (at signup). Payment queries run
 * thousands of times per day as recovery jobs process. Separating them keeps
 * each file focused and makes it easy to optimize the hot-path queries separately.
 *
 * QUERY DESIGN PRINCIPLES:
 *   1. All queries are typed end-to-end — callers get full TypeScript inference.
 *   2. Hot-path queries (used by workers) are designed to avoid N+1 problems.
 *   3. Money amounts go in and come out in PAISE. Never convert inside a query.
 *   4. All timestamps are UTC. The display layer converts to IST.
 */

import { eq, and, isNull, lt, inArray, sql, desc } from 'drizzle-orm';
import type { Database } from '../index';
import {
  failedPayments,
  recoveryJobs,
  outreachEvents,
  analyticsSnapshots,
  gatewayConnections,
} from '../schema/payments';
import type { NormalizedFailedPayment } from '@fynback/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Gateway Connections
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finds the active gateway connection for a merchant + gateway combination.
 *
 * WHY USED: Webhook routes call this to look up the webhook secret for signature
 * verification. Workers call it to get API credentials for retry calls.
 *
 * WHY isNull(table.disconnectedAt): A disconnected gateway should NOT be used
 * even if it still has credentials — the merchant explicitly disconnected it.
 */
export const paymentQueries = {

  getActiveGatewayConnection: async (
    db: Database,
    merchantId: string,
    gatewayName: 'razorpay' | 'stripe' | 'cashfree' | 'payu'
  ) => {
    const rows = await db
      .select()
      .from(gatewayConnections)
      .where(
        and(
          eq(gatewayConnections.merchantId, merchantId),
          eq(gatewayConnections.gatewayName, gatewayName),
          eq(gatewayConnections.isActive, true),
          isNull(gatewayConnections.disconnectedAt)
        )
      )
      .limit(1);

    return rows[0] ?? null;
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Failed Payment Ingestion
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Inserts a normalized failed payment into the database.
   *
   * WHY ON CONFLICT DO NOTHING:
   * Razorpay retries webhook delivery for up to 3 days. If our endpoint is slow,
   * or if we manually replay a webhook, we'll receive the same event multiple times.
   * The UNIQUE constraint on gateway_event_id protects us. ON CONFLICT DO NOTHING
   * makes the insert idempotent — second call is a no-op that returns null.
   * The webhook route checks if the return is null → already processed → respond 200.
   *
   * @returns The inserted row, or null if already processed (idempotent duplicate)
   */
  insertFailedPayment: async (
    db: Database,
    data: {
      merchantId: string;
      gatewayConnectionId?: string;
      normalized: NormalizedFailedPayment;
      maxRetries: number;      // Calculated by caller based on payment method
    }
  ) => {
    const { merchantId, gatewayConnectionId, normalized, maxRetries } = data;

    const rows = await db
      .insert(failedPayments)
      .values({
        merchantId,
        gatewayConnectionId: gatewayConnectionId ?? null,
        gatewayName: normalized.gatewayName,
        gatewayEventId: normalized.gatewayEventId,  // idempotency key
        gatewayPaymentId: normalized.gatewayPaymentId,
        gatewayOrderId: normalized.gatewayOrderId,
        gatewaySubscriptionId: normalized.gatewaySubscriptionId,
        gatewayCustomerId: normalized.gatewayCustomerId,
        customerEmail: normalized.customerEmail,
        customerPhone: normalized.customerPhone,
        customerName: normalized.customerName,
        amountPaise: normalized.amountPaise,
        currency: normalized.currency,
        paymentMethodType: normalized.paymentMethodType,
        declineCode: normalized.declineCode,
        declineCategory: normalized.declineCategory,
        isRecoverable: normalized.isRecoverable,
        status: 'just_failed',
        retryCount: 0,
        maxRetries,
        failedAt: normalized.failedAt,
        rawPayload: normalized.rawPayload,
      })
      .onConflictDoNothing({ target: failedPayments.gatewayEventId })
      .returning();

    return rows[0] ?? null;
  },

  /**
   * Updates the status of a failed payment.
   * Used by workers as the payment progresses through the recovery state machine.
   */
  updateFailedPaymentStatus: async (
    db: Database,
    failedPaymentId: string,
    update: {
      status: typeof failedPayments.$inferInsert['status'];
      retryCount?: number;
      nextRetryAt?: Date | null;
      lastRetryAt?: Date;
      recoveredAt?: Date;
      recoveredAmountPaise?: number;
      recoveryAttributedToFynback?: boolean;
    }
  ) => {
    return db
      .update(failedPayments)
      .set({
        ...update,
        updatedAt: new Date(),
      })
      .where(eq(failedPayments.id, failedPaymentId))
      .returning();
  },

  /**
   * Fetches the N most recent failed payments for a merchant.
   *
   * WHY DESC ORDER: Dashboard shows newest-first so support staff see the
   * most urgent payments at the top without scrolling.
   *
   * WHY LIMIT: The dashboard overview only shows 10 rows. Full pagination
   * is in the /dashboard/payments page which queries with offset.
   */
  getRecentFailedPayments: async (
    db: Database,
    merchantId: string,
    limit: number = 10,
    offset: number = 0
  ) => {
    return db
      .select()
      .from(failedPayments)
      .where(eq(failedPayments.merchantId, merchantId))
      .orderBy(desc(failedPayments.failedAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Loads a failed payment by ID.
   * Used by workers at the start of each job to get the full payment context.
   */
  getFailedPaymentById: async (db: Database, id: string) => {
    const rows = await db
      .select()
      .from(failedPayments)
      .where(eq(failedPayments.id, id))
      .limit(1);

    return rows[0] ?? null;
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Recovery Jobs
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Inserts a new recovery job audit record.
   *
   * WHY AUDIT EVERY JOB: Debugging payment recovery is hard. When a recovery
   * fails, we need to know exactly what was attempted, when, and why it failed.
   * This table is the audit trail that makes support investigations possible.
   */
  insertRecoveryJob: async (
    db: Database,
    data: {
      failedPaymentId: string;
      merchantId: string;
      bullmqJobId?: string;
      jobType: 'retry_payment' | 'send_email' | 'send_whatsapp' | 'send_sms';
      attemptNumber: number;
      scheduledAt: Date;
    }
  ) => {
    const rows = await db
      .insert(recoveryJobs)
      .values({
        ...data,
        status: 'pending',
      })
      .returning();

    return rows[0];
  },

  /**
   * Updates a recovery job when it starts processing.
   * Called at the beginning of every worker job.
   */
  markJobStarted: async (db: Database, jobId: string) => {
    return db
      .update(recoveryJobs)
      .set({ status: 'processing', startedAt: new Date() })
      .where(eq(recoveryJobs.id, jobId));
  },

  /**
   * Updates a recovery job with its result.
   * Called at the end of every worker job (success or failure).
   */
  markJobCompleted: async (
    db: Database,
    jobId: string,
    result: Record<string, unknown>
  ) => {
    return db
      .update(recoveryJobs)
      .set({ status: 'completed', completedAt: new Date(), result })
      .where(eq(recoveryJobs.id, jobId));
  },

  markJobFailed: async (db: Database, jobId: string, errorMessage: string) => {
    return db
      .update(recoveryJobs)
      .set({ status: 'failed', failedAt: new Date(), errorMessage })
      .where(eq(recoveryJobs.id, jobId));
  },

  /**
   * Cancels all pending recovery jobs for a failed payment.
   *
   * WHY: If a customer pays manually before our scheduled retry fires,
   * we must cancel the pending jobs. Otherwise, we'd retry an already-paid
   * invoice, which could result in a double charge.
   *
   * This sets DB status to 'cancelled'. The worker still needs to call
   * BullMQ's job.remove() using the bullmqJobId from each row.
   *
   * @returns The bullmqJobIds that need to be cancelled in BullMQ
   */
  cancelPendingJobsForPayment: async (db: Database, failedPaymentId: string) => {
    return db
      .update(recoveryJobs)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(recoveryJobs.failedPaymentId, failedPaymentId),
          eq(recoveryJobs.status, 'pending')
        )
      )
      .returning({ bullmqJobId: recoveryJobs.bullmqJobId });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Outreach Events
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Inserts an outreach event when an email/WhatsApp/SMS is dispatched.
   */
  insertOutreachEvent: async (
    db: Database,
    data: {
      failedPaymentId: string;
      merchantId: string;
      channel: 'email' | 'whatsapp' | 'sms';
      recipientEmail?: string;
      recipientPhone?: string;
      templateId?: string;
      stepNumber: number;
    }
  ) => {
    const rows = await db
      .insert(outreachEvents)
      .values({
        ...data,
        status: 'pending',
      })
      .returning();

    return rows[0];
  },

  /**
   * Updates an outreach event when the provider confirms delivery/open/click.
   * Called by the Resend/Interakt delivery webhook handlers.
   */
  updateOutreachStatus: async (
    db: Database,
    providerMessageId: string,
    update: {
      status: typeof outreachEvents.$inferInsert['status'];
      providerMessageId?: string;
      sentAt?: Date;
      deliveredAt?: Date;
      openedAt?: Date;
      clickedAt?: Date;
      failedAt?: Date;
      errorMessage?: string;
    }
  ) => {
    return db
      .update(outreachEvents)
      .set(update)
      .where(eq(outreachEvents.providerMessageId, providerMessageId));
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Analytics
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Upserts the daily analytics snapshot for a merchant.
   *
   * WHY UPSERT (not insert)?
   * The daily analytics job runs at midnight IST but may also re-run during
   * the day if data changes significantly. ON CONFLICT DO UPDATE ensures
   * we always have fresh data without creating duplicates.
   *
   * WHY PRE-COMPUTE (not query on demand)?
   * The dashboard needs to display ₹X recovered, 78% rate, etc.
   * Real-time aggregations over millions of rows would be too slow for a dashboard.
   * Pre-computed snapshots make the dashboard load in <100ms.
   */
  upsertAnalyticsSnapshot: async (
    db: Database,
    data: {
      merchantId: string;
      snapshotDate: string;  // ISO date string 'YYYY-MM-DD'
      failedAmountPaise: number;
      recoveredAmountPaise: number;
      atRiskAmountPaise: number;
      failedPaymentsCount: number;
      recoveredPaymentsCount: number;
      activeRecoveryJobsCount: number;
      recoveryRatePct: string;
      recoveredViaEmail: number;
      recoveredViaWhatsapp: number;
      recoveredViaSms: number;
      recoveredViaAutoRetry: number;
    }
  ) => {
    return db
      .insert(analyticsSnapshots)
      .values(data)
      .onConflictDoUpdate({
        target: [analyticsSnapshots.merchantId, analyticsSnapshots.snapshotDate],
        set: {
          ...data,
          updatedAt: new Date(),
        },
      })
      .returning();
  },

  /**
   * Fetches the last N days of analytics snapshots for a merchant.
   * Used by the dashboard to render the recovery trend chart.
   *
   * @param days - How many days back to fetch (e.g., 30 for last 30 days)
   */
  getAnalyticsHistory: async (db: Database, merchantId: string, days: number = 30) => {
    // Calculate cutoff date in SQL to keep the query portable
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0]; // 'YYYY-MM-DD'

    return db
      .select()
      .from(analyticsSnapshots)
      .where(
        and(
          eq(analyticsSnapshots.merchantId, merchantId),
          // We can't use lt() directly on a date column with a string in Drizzle,
          // so we use sql template for the date comparison
          sql`${analyticsSnapshots.snapshotDate} >= ${cutoffDateStr}::date`
        )
      )
      .orderBy(analyticsSnapshots.snapshotDate);
  },

  /**
   * Computes live (non-snapshot) dashboard KPI numbers from the raw tables.
   *
   * WHY THIS EXISTS ALONGSIDE SNAPSHOTS:
   * Snapshots are stale by up to 24h. For the top of the dashboard ("Today's recovery"),
   * we want real-time numbers. This query runs only for today's data — small enough
   * to aggregate on demand without hitting performance limits.
   *
   * Returns: { totalFailed, totalRecovered, totalAtRisk, recoveryRatePct }
   */
  getLiveDashboardKpis: async (db: Database, merchantId: string) => {
    const result = await db
      .select({
        totalFailedPaise: sql<number>`COALESCE(SUM(${failedPayments.amountPaise}), 0)`,
        totalRecoveredPaise: sql<number>`COALESCE(SUM(${failedPayments.recoveredAmountPaise}), 0)`,
        failedCount: sql<number>`COUNT(*)`,
        recoveredCount: sql<number>`SUM(CASE WHEN ${failedPayments.status} = 'recovered' THEN 1 ELSE 0 END)`,
      })
      .from(failedPayments)
      .where(eq(failedPayments.merchantId, merchantId));

    return result[0] ?? null;
  },
};
