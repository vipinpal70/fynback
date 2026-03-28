/**
 * campaign.queue.ts
 *
 * BullMQ queue for the campaign (dunning sequence) engine.
 *
 * WHY ONE QUEUE FOR ALL CAMPAIGN JOB TYPES?
 * Same reasoning as recovery.queue — single queue keeps Redis connections low
 * and priority scheduling simple. The 'type' field discriminates the handler.
 *
 * WHY SEPARATE FROM recoveryQueue?
 * Campaign jobs have different characteristics:
 *   - ExecuteCampaignStepJobData uses long delays (days, not hours)
 *   - ValidateCustomerChannels needs fast processing (should run within seconds)
 *   - Mixing with retry_payment jobs could starve one type under load
 *
 * DELAY HANDLING:
 * BullMQ supports delayed jobs natively. ExecuteCampaignStepJobData is added
 * with delay = dayOffset * 24 * 60 * 60 * 1000 milliseconds. BullMQ stores
 * these in a Redis sorted set and promotes them to the active queue when due.
 * This means the worker doesn't need to poll — BullMQ handles scheduling.
 */

import { Queue } from 'bullmq';
import { bullmqConnection } from '../connection';
import type { CampaignJobData } from '../types/campaign.types';

export const campaignQueue = new Queue<CampaignJobData>('campaignQueue', {
  connection: bullmqConnection as any,

  defaultJobOptions: {
    /**
     * 3 retry attempts for most jobs.
     * execute_campaign_step is idempotent (checks run status first),
     * so retrying on transient failures (Resend timeout, WhatsApp API 503) is safe.
     */
    attempts: 3,

    backoff: {
      type: 'exponential',
      delay: 5000, // 5s, 25s, 125s
    },

    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

/**
 * Dedicated queue for the payday cron notification.
 * WHY SEPARATE: Payday jobs run once on a schedule (1st + 25th).
 * Keeping them separate avoids them getting buried behind campaign step jobs.
 */
export const paydayQueue = new Queue('paydayQueue', {
  connection: bullmqConnection as any,

  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 60000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});
