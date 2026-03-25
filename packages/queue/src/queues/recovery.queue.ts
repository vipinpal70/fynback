/**
 * recovery.queue.ts
 *
 * BullMQ queue definitions for the payment recovery engine.
 *
 * WHY ONE QUEUE (not separate queues per job type)?
 * A single 'recoveryQueue' handles all recovery job types (retry_payment,
 * send_email, send_whatsapp, send_sms). The job's 'type' field inside the data
 * distinguishes what to do.
 *
 * ALTERNATIVE CONSIDERED: Separate queues per channel.
 * REJECTED BECAUSE:
 *   1. More queues = more Redis connections = higher cost.
 *   2. Priority scheduling (email before SMS, retry before email) is easier
 *      with one queue using BullMQ's built-in job priority field.
 *   3. Rate limiting (e.g., max 10 WhatsApp messages/second) is simpler per-queue.
 *      If we need per-channel rate limiting later, we can split then.
 *
 * WHY DEFAULT JOB OPTIONS:
 *   attempts: 3  → If the worker throws, BullMQ retries the job 3 times
 *                   before marking it as failed. This handles transient errors
 *                   (Resend API timeout, gateway 503) without losing the job.
 *
 *   backoff: exponential, 5000ms → First retry after 5s, then 25s, then 125s.
 *            WHY EXPONENTIAL: Avoids thundering herd. If Resend is overloaded,
 *            every failing job retrying at the same interval makes it worse.
 *
 *   removeOnComplete: { count: 1000 } → Keep last 1000 completed jobs in Redis.
 *                     WHY: Completed jobs take Redis memory. We keep 1000 for
 *                     recent debugging but don't need millions of old records.
 *                     The audit trail lives in the recovery_jobs DB table.
 *
 *   removeOnFail: { count: 5000 } → Keep more failed jobs for debugging.
 *                 WHY MORE: Failed jobs need manual investigation. Keep 5k.
 */

import { Queue } from 'bullmq';
import { bullmqConnection } from '../connection';
import type { RecoveryJobData } from '../types/recovery.types';

/**
 * The central queue for all payment recovery jobs.
 *
 * WHY TYPE PARAMETER Queue<RecoveryJobData>?
 * BullMQ supports generic type parameters for job data. This makes job.data
 * fully typed when accessed in the worker, preventing runtime errors from
 * accessing undefined fields.
 */
export const recoveryQueue = new Queue<RecoveryJobData>('recoveryQueue', {
  connection: bullmqConnection as any,

  defaultJobOptions: {
    /**
     * Retry a job up to 3 times before marking it as permanently failed.
     * WHY 3: Balances reliability (catching transient errors) vs. performance
     * (not endlessly retrying genuinely broken jobs).
     */
    attempts: 3,

    backoff: {
      type: 'exponential',
      /**
       * 5 seconds initial delay between retry attempts.
       * With exponential backoff: attempt 2 at 5s, attempt 3 at 25s, attempt 4 at 125s.
       * WHY 5s: Long enough for transient issues (API timeout) to resolve.
       *         Short enough to not noticeably delay a recovery campaign.
       */
      delay: 5000,
    },

    /**
     * Keep the last 1000 completed jobs in Redis for recent debugging.
     * The permanent audit trail is in the recovery_jobs DB table, not Redis.
     */
    removeOnComplete: { count: 1000 },

    /**
     * Keep more failed jobs (5000) for diagnosis — failed jobs need investigation.
     * BullMQ's Bull Board UI shows these for manual inspection.
     */
    removeOnFail: { count: 5000 },
  },
});

/**
 * Queue for the daily analytics snapshot computation job.
 *
 * WHY A SEPARATE QUEUE FOR ANALYTICS?
 * The analytics job is a heavy DB aggregation (COUNT + SUM across potentially
 * millions of rows). Putting it in the recoveryQueue would block recovery jobs
 * from processing while analytics runs — that would delay customer recovery emails.
 * A dedicated queue lets us configure different concurrency:
 *   recoveryQueue: concurrency 10 (fast, many parallel jobs)
 *   analyticsQueue: concurrency 1 (one slow job at a time, doesn't need more)
 */
export const analyticsQueue = new Queue('analyticsQueue', {
  connection: bullmqConnection as any,

  defaultJobOptions: {
    attempts: 2,  // Analytics can fail once and retry — not as critical as recovery
    backoff: {
      type: 'fixed',
      delay: 60000, // Wait 1 minute before retrying a failed analytics snapshot
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});
