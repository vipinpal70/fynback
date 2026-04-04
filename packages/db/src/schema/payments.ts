/**
 * schema/payments.ts
 *
 * Database tables for the payment recovery engine.
 *
 * WHY A SEPARATE FILE FROM merchants.ts?
 * merchants.ts owns the business identity layer (who the merchant is, their plan,
 * their team). This file owns the operational layer (what payments failed, what
 * recovery actions we took, what the results were). Keeping them separate makes
 * migrations and feature flags easier — we can ship gateway support independently
 * from billing changes.
 *
 * TABLE OVERVIEW:
 *   gateway_connections  → credentials + webhook config per gateway per merchant
 *   failed_payments      → every failed payment, normalized from any gateway
 *   recovery_jobs        → BullMQ job audit log (one row per job dispatched)
 *   outreach_events      → every email/WhatsApp/SMS we sent
 *   analytics_snapshots  → daily rollup per merchant (pre-computed for fast dashboard)
 *
 * MONEY RULE: All monetary amounts are stored in PAISE (smallest Indian unit).
 * Integer arithmetic is exact. ₹100.50 = 10050 paise. Never store rupees as decimals.
 *
 * TIMESTAMP RULE: All timestamps are UTC with timezone (TIMESTAMPTZ).
 * The app layer converts to IST for display. Never store IST in the database.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  bigint,
  numeric,
  timestamp,
  pgEnum,
  jsonb,
  date,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// Import the merchants table for foreign key references
import { merchants } from './merchants';

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Supported payment gateways.
 * WHY ENUM: Prevents typos and invalid values at the DB level, not just app level.
 */
export const gatewayNameEnum = pgEnum('gateway_name', [
  'razorpay',
  'stripe',
  'cashfree',
  'payu',
]);

/**
 * Payment method type.
 *
 * WHY THIS MATTERS FOR RECOVERY LOGIC:
 * upi_autopay has NPCI's 4-attempt rule — max 4 retries per billing cycle.
 * net_banking cannot be auto-retried; must send payment link immediately.
 * credit_card / debit_card can be retried 3-4 times with spacing.
 */
export const paymentMethodTypeEnum = pgEnum('payment_method_type', [
  'credit_card',
  'debit_card',
  'upi_autopay',
  'net_banking',
  'wallet',
  'emi',
]);

/**
 * Why the payment failed — maps 100+ raw gateway codes into 6 actionable buckets.
 *
 * soft_decline  → Retry with spacing (3h, 24h, 72h, 7d)
 * hard_decline  → No retry. Send update-card link immediately. Retrying risks fines.
 * card_expired  → No retry. Card is past expiry date.
 * upi_failure   → Retry with NPCI rules (max 4 total). Align with payday windows.
 * bank_decline  → Retry once after 24h. Then WhatsApp.
 * unknown       → Treat like soft_decline: retry once, then email sequence.
 */
export const declineCategoryEnum = pgEnum('decline_category', [
  'soft_decline',
  'hard_decline',
  'card_expired',
  'upi_failure',
  'bank_decline',
  'unknown',
]);

/**
 * State machine for the recovery lifecycle of each failed payment.
 *
 * FLOW (recoverable):  just_failed → retry_scheduled → retrying → recovered
 *                                                               → email_sequence → recovered
 * FLOW (hard decline): just_failed → email_sequence → whatsapp_sent → sms_sent → cancelled
 * TERMINAL STATES:     recovered, cancelled
 */
export const paymentEventStatusEnum = pgEnum('payment_event_status', [
  'just_failed',
  'retry_scheduled',
  'retrying',
  'email_sequence',
  'whatsapp_sent',
  'sms_sent',
  'card_updated',
  'recovered',
  'cancelled',
]);

/**
 * Communication channels for outreach.
 * WHY: Each channel has different open rates in India:
 *   Email: 10-20% open rate
 *   WhatsApp: 80-95% open rate (primary channel for India)
 *   SMS: 30-50% open rate (fallback when WhatsApp not enabled)
 */
export const outreachChannelEnum = pgEnum('outreach_channel', [
  'email',
  'whatsapp',
  'sms',
]);

/**
 * Delivery status of outreach messages.
 * WHY: We track beyond 'sent' to measure actual engagement.
 * Recovery attribution requires knowing if the customer opened/clicked before paying.
 */
export const outreachStatusEnum = pgEnum('outreach_status', [
  'pending',
  'sent',
  'delivered',
  'failed',
  'opened',
  'clicked',
]);

/**
 * Status of a BullMQ recovery job.
 * WHY SEPARATE FROM paymentEventStatus: A single failed_payment can have multiple
 * recovery_jobs (one per retry attempt, one per email step). This tracks individual
 * job health, not the overall payment recovery state.
 */
export const recoveryJobStatusEnum = pgEnum('recovery_job_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Table: gateway_connections
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stores one row per gateway per merchant.
 *
 * WHY: Each merchant can connect multiple gateways (e.g., Razorpay for domestic,
 * Stripe for international). We need to track credentials, webhook config, and
 * health status independently for each connection.
 *
 * WHY ENCRYPTED COLUMNS: API keys and OAuth tokens are stored encrypted using
 * packages/crypto (AES-256). If the database is compromised, raw keys are safe.
 * The encryption key lives in the ENCRYPTION_SECRET environment variable.
 *
 * WHY webhook_secret: Each gateway sends a secret with every webhook for HMAC
 * signature verification. We store it encrypted to verify incoming webhooks
 * without trusting the source IP alone.
 */
export const gatewayConnections = pgTable(
  'gateway_connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // Which merchant owns this connection
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),

    gatewayName: gatewayNameEnum('gateway_name').notNull(),

    // Encrypted API credentials
    // Using text (not varchar) because encrypted strings can be long and unpredictable
    apiKeyEncrypted: text('api_key_encrypted'),
    apiSecretEncrypted: text('api_secret_encrypted'),

    // OAuth tokens (used for Razorpay Partner API, Stripe Connect)
    // WHY ENCRYPTED: OAuth access tokens are equivalent to passwords — encrypt at rest
    oauthAccessTokenEncrypted: text('oauth_access_token_encrypted'),
    oauthRefreshTokenEncrypted: text('oauth_refresh_token_encrypted'),
    oauthExpiresAt: timestamp('oauth_expires_at', { withTimezone: true }),

    /**
     * Webhook signing secret from the gateway.
     * WHY: Every incoming webhook is verified using HMAC-SHA256 with this secret.
     * If a request fails verification, we reject it with 401. This prevents anyone
     * from spoofing fake payment failure events to trigger recovery campaigns.
     */
    webhookSecretEncrypted: text('webhook_secret_encrypted'),

    // The URL we registered with the gateway for webhooks
    // WHY STORED: Needed to detect if the URL changes (e.g., domain migration)
    webhookUrl: text('webhook_url'),
    webhookRegisteredAt: timestamp('webhook_registered_at', { withTimezone: true }),
    lastWebhookReceivedAt: timestamp('last_webhook_received_at', { withTimezone: true }),

    isActive: boolean('is_active').default(false).notNull(),

    /**
     * Whether this connection is in test/sandbox mode.
     * WHY: Test-mode payments must NEVER trigger real recovery campaigns.
     * The webhook handler checks this flag before dispatching any jobs.
     */
    testMode: boolean('test_mode').default(false).notNull(),

    connectedAt: timestamp('connected_at', { withTimezone: true }),
    disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // One merchant can have at most one connection per gateway
    // WHY UNIQUE: Prevents duplicate connections; enforce at DB level, not just app level
    merchantGatewayIdx: uniqueIndex('gateway_connections_merchant_gateway_idx').on(
      table.merchantId,
      table.gatewayName
    ),

    // Fast lookup by merchant (used on the gateway settings page)
    merchantIdx: index('gateway_connections_merchant_idx').on(table.merchantId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Table: failed_payments
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Central table — one row per failed payment event received from any gateway.
 *
 * WHY DENORMALIZE customer fields (email, phone, name)?
 * Recovery workers and email jobs run on hot paths. Avoiding JOINs to a customer
 * table keeps job processing fast and reduces DB load during recovery campaign execution.
 * The source of truth for customer data is the gateway — these are copies for operational use.
 *
 * WHY STORE raw_payload AS JSONB?
 * Two reasons:
 *   1. Debugging: When a recovery job fails unexpectedly, we have the full context.
 *   2. Re-processing: If we improve the normalizer, we can re-derive fields without
 *      re-ingesting webhooks from the gateway.
 * GIN index makes JSONB queries fast (e.g., finding all failures from a specific card).
 */
export const failedPayments = pgTable(
  'failed_payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),

    // Which gateway connection produced this event
    gatewayConnectionId: uuid('gateway_connection_id').references(
      () => gatewayConnections.id,
      { onDelete: 'set null' } // Keep the payment record even if gateway is disconnected
    ),

    gatewayName: gatewayNameEnum('gateway_name').notNull(),

    /**
     * Unique event ID from the gateway.
     * WHY UNIQUE INDEX: Gateways retry webhook delivery if our endpoint returns non-2xx.
     * This constraint ensures we never process the same event twice, preventing
     * duplicate recovery campaigns for the same failed payment.
     * This is our primary idempotency key.
     */
    gatewayEventId: varchar('gateway_event_id', { length: 255 }).notNull().unique(),

    // Gateway-specific IDs for API calls (retry, refund, status check)
    gatewayPaymentId: varchar('gateway_payment_id', { length: 255 }),
    gatewayOrderId: varchar('gateway_order_id', { length: 255 }),
    gatewaySubscriptionId: varchar('gateway_subscription_id', { length: 255 }),
    gatewayCustomerId: varchar('gateway_customer_id', { length: 255 }),

    // Denormalized customer info for fast job processing without JOINs
    customerEmail: varchar('customer_email', { length: 320 }),
    customerPhone: varchar('customer_phone', { length: 20 }),
    customerName: varchar('customer_name', { length: 255 }),

    /**
     * Amount in PAISE (integer, never float).
     * WHY INTEGER: ₹100.50 = 10050 paise. Integer arithmetic is exact.
     * Floating-point errors would corrupt financial reports and MRR calculations.
     * Max integer value of ~2.1B covers amounts up to ₹21,000,000 (₹2.1 Crore).
     * For larger amounts, switch to bigint.
     */
    amountPaise: integer('amount_paise').notNull(),

    /**
     * ISO 4217 currency code (max 3 chars).
     * WHY: FynBack is India-first but supports Stripe international (USD, EUR, etc.)
     * All non-INR amounts are converted to INR paise at ingestion time for unified reporting.
     */
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),

    paymentMethodType: paymentMethodTypeEnum('payment_method_type').default('credit_card').notNull(),

    /**
     * Raw decline code from the gateway.
     * Examples: 'insufficient_funds', 'do_not_honor', 'PAYMENT_TIMEOUT', 'card_expired'
     * WHY KEPT RAW: Useful for debugging and for future reclassification without
     * re-ingesting. Our declineCategory is derived from this but may be updated.
     */
    declineCode: varchar('decline_code', { length: 100 }),

    // Our classification of the decline (drives recovery strategy)
    declineCategory: declineCategoryEnum('decline_category').default('unknown').notNull(),

    /**
     * Whether we should attempt auto-recovery for this payment.
     * false = hard decline / fraud flag — do not retry, go straight to payment link email.
     * WHY: Retrying a stolen/fraudulent card is a card scheme violation.
     * Visa/MC can fine merchants for excessive retries on hard declines.
     */
    isRecoverable: boolean('is_recoverable').default(true).notNull(),

    // Current state in the recovery state machine
    status: paymentEventStatusEnum('status').default('just_failed').notNull(),

    /**
     * How many auto-retry attempts have been made so far.
     * WHY TRACKED: For UPI AutoPay, NPCI mandates max 4 total attempts (including
     * the original failure). So maxRetries for UPI = 3 (3 retries after the 1st fail).
     * For cards, typically 3-4 retries are safe before risking card scheme penalties.
     */
    retryCount: integer('retry_count').default(0).notNull(),

    /**
     * Maximum retries allowed for this payment.
     * Set at ingestion time based on payment method:
     *   UPI AutoPay: 3 (NPCI allows 4 total — 1 original + 3 retries)
     *   Card:        3 (safe limit before Visa/MC excessive retry rules kick in)
     *   Net Banking: 0 (cannot auto-retry; must use payment link)
     */
    maxRetries: integer('max_retries').default(3).notNull(),

    // Scheduling
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    lastRetryAt: timestamp('last_retry_at', { withTimezone: true }),

    // Recovery outcome
    recoveredAt: timestamp('recovered_at', { withTimezone: true }),
    recoveredAmountPaise: integer('recovered_amount_paise'),

    /**
     * Was this recovery directly caused by FynBack's intervention?
     * WHY: Critical for accurate attribution and our billing model.
     * If the customer paid on their own (not via our email/WhatsApp link),
     * we should NOT charge the 5% recovery fee on that amount.
     * Attribution logic: true if customer paid within 24h of our outreach,
     * via our payment link, OR if we triggered a successful auto-retry.
     */
    recoveryAttributedToFynback: boolean('recovery_attributed_to_fynback'),

    // When the payment actually failed at the gateway (not when webhook arrived)
    failedAt: timestamp('failed_at', { withTimezone: true }).notNull(),

    /**
     * Complete original webhook body stored as JSONB.
     * WHY JSONB OVER TEXT: JSONB is indexed, queryable, and type-validated.
     * GIN index below allows fast queries like:
     *   "find all failures from Razorpay where error_code = 'PAYMENT_TIMEOUT'"
     */
    rawPayload: jsonb('raw_payload').notNull(),

    /**
     * Links to the active campaign run for this payment (set by campaign-scheduler).
     * Stored as nullable UUID text (no FK here to avoid circular schema imports:
     * campaigns.ts already imports failed_payments from this file).
     * Use campaign_runs.failed_payment_id for the authoritative join.
     */
    activeCampaignRunId: uuid('active_campaign_run_id'),

    /**
     * Why recovery was cancelled without completion.
     * Set when status transitions to 'cancelled' so the dashboard can explain
     * why no further outreach was attempted.
     * Known values:
     *   'email_not_found_whatsapp_disabled'        — contact has no email and merchant has WhatsApp off
     *   'email_sequence_exhausted_whatsapp_disabled' — 3 emails sent, WhatsApp off, no more channels
     *   'email_sequence_exhausted_no_phone'         — 3 emails sent, no phone to escalate to WhatsApp
     */
    cancellationReason: text('cancellation_reason'),

    // Soft delete (deletedAt not used for failed_payments — we keep all for compliance)
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Merchant + status for dashboard queries (e.g., "show me all active recoveries")
    merchantStatusIdx: index('failed_payments_merchant_status_idx').on(
      table.merchantId,
      table.status
    ),

    // Merchant + date for analytics (e.g., "failures this month")
    merchantDateIdx: index('failed_payments_merchant_date_idx').on(
      table.merchantId,
      table.failedAt
    ),

    // Subscription ID lookup (needed to find all failures for a given subscription)
    subscriptionIdx: index('failed_payments_subscription_idx').on(
      table.gatewaySubscriptionId
    ),

    // Gateway connection lookup (needed to check if a connection is still healthy)
    connectionIdx: index('failed_payments_connection_idx').on(
      table.gatewayConnectionId
    ),

    // Status + nextRetryAt for the worker query:
    // "give me all jobs scheduled to retry in the next minute"
    statusRetryIdx: index('failed_payments_status_retry_idx').on(
      table.status,
      table.nextRetryAt
    ),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Table: recovery_jobs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Audit log for every BullMQ job dispatched for a failed payment.
 *
 * WHY A SEPARATE TABLE FROM failed_payments?
 * A single failed payment can trigger multiple jobs:
 *   - retry_payment (attempt 1, 2, 3)
 *   - send_email (step 1, step 2, step 3)
 *   - send_whatsapp
 *   - send_sms
 * The failed_payments table tracks the overall state (status field).
 * This table tracks individual job execution history for debugging and billing.
 *
 * WHY STORE bullmq_job_id?
 * We can use it to cancel a pending job (e.g., if the customer pays manually
 * before our scheduled retry fires). BullMQ's job.remove() takes the job ID.
 */
export const recoveryJobs = pgTable(
  'recovery_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    failedPaymentId: uuid('failed_payment_id')
      .notNull()
      .references(() => failedPayments.id, { onDelete: 'cascade' }),

    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),

    // The BullMQ job ID — used to cancel pending jobs if payment recovers first
    bullmqJobId: varchar('bullmq_job_id', { length: 255 }),

    /**
     * Type of work this job does.
     * WHY VARCHAR: Job types may expand as we add channels. Enum would require
     * a migration every time. VARCHAR with app-level validation is more flexible.
     */
    jobType: varchar('job_type', { length: 50 }).notNull(), // 'retry_payment' | 'send_email' | 'send_whatsapp' | 'send_sms'

    status: recoveryJobStatusEnum('status').default('pending').notNull(),

    /**
     * Which retry/email attempt this is (1-indexed).
     * WHY: For emails, this determines which template to use (step 1/2/3).
     * For retries, this tracks position against maxRetries.
     */
    attemptNumber: integer('attempt_number').default(1).notNull(),

    // Timing
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),

    errorMessage: text('error_message'),

    /**
     * Job result stored as JSONB.
     * Examples:
     *   retry_payment success: { newPaymentId: 'pay_xxx', status: 'captured' }
     *   send_email success:    { resendMessageId: 'msg_xxx', recipientEmail: '...' }
     *   job failure:           { error: 'Gateway timeout', attempt: 3 }
     */
    result: jsonb('result'),

    /**
     * Links this job to its campaign run (set when dispatched by campaign-scheduler).
     * Nullable: legacy jobs and direct-dispatch jobs won't have a campaign run.
     * Stored as UUID without FK to avoid circular import (campaigns.ts → payments.ts).
     */
    campaignRunId: uuid('campaign_run_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Lookup all jobs for a specific failed payment (e.g., to cancel pending ones)
    failedPaymentIdx: index('recovery_jobs_failed_payment_idx').on(
      table.failedPaymentId
    ),

    // Merchant + status for operations dashboard
    merchantStatusIdx: index('recovery_jobs_merchant_status_idx').on(
      table.merchantId,
      table.status
    ),

    // Find jobs by BullMQ ID (needed for job cancellation)
    bullmqJobIdx: index('recovery_jobs_bullmq_job_idx').on(table.bullmqJobId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Table: outreach_events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Log of every communication sent to a customer as part of recovery.
 *
 * WHY SEPARATE FROM recovery_jobs?
 * recovery_jobs tracks what BullMQ was asked to do.
 * outreach_events tracks what was actually sent to the customer and how they responded.
 * A job can succeed (sent) while an outreach event can fail (bad email address).
 *
 * WHY TRACK opened_at / clicked_at?
 * Attribution logic: if a customer opens our email and then pays within 24h,
 * that recovery is attributed to FynBack → we charge the 5% recovery fee.
 * These webhooks come from Resend (email events) and Interakt (WhatsApp delivery).
 */
export const outreachEvents = pgTable(
  'outreach_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    failedPaymentId: uuid('failed_payment_id')
      .notNull()
      .references(() => failedPayments.id, { onDelete: 'cascade' }),

    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),

    channel: outreachChannelEnum('channel').notNull(),

    recipientEmail: varchar('recipient_email', { length: 320 }),
    recipientPhone: varchar('recipient_phone', { length: 20 }),

    /**
     * Which campaign template was used.
     * WHY: Merchants can customize their recovery email templates.
     * Storing which template was used enables A/B testing analysis.
     */
    templateId: varchar('template_id', { length: 100 }),

    /**
     * Which step in the recovery sequence this is (1-indexed).
     * Step 1 = "Payment issue, please update" (Day 0-1)
     * Step 2 = "Urgent: service at risk" (Day 3-4)
     * Step 3 = "Last chance + pause offer" (Day 6-7)
     */
    stepNumber: integer('step_number').default(1).notNull(),

    status: outreachStatusEnum('status').default('pending').notNull(),

    /**
     * Provider-assigned message ID for delivery tracking.
     * Resend assigns an ID on send. Interakt assigns one for WhatsApp.
     * WHY: Needed to correlate delivery/open webhooks back to our records.
     */
    providerMessageId: varchar('provider_message_id', { length: 255 }),

    // Delivery lifecycle timestamps
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    clickedAt: timestamp('clicked_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),

    errorMessage: text('error_message'),

    /**
     * Links back to the campaign_run_steps row that triggered this outreach.
     * NULL for legacy outreach created before the campaign engine existed.
     * Stored as UUID without FK (campaigns.ts imports outreach_events from this file;
     * adding a FK here would create a circular dependency).
     */
    campaignRunStepId: uuid('campaign_run_step_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // All outreach for a failed payment (e.g., cancel pending emails on recovery)
    failedPaymentIdx: index('outreach_events_failed_payment_idx').on(
      table.failedPaymentId
    ),

    // Merchant + channel for campaign analytics
    merchantChannelIdx: index('outreach_events_merchant_channel_idx').on(
      table.merchantId,
      table.channel
    ),

    // Find by provider message ID (needed for delivery webhook correlation)
    providerMsgIdx: index('outreach_events_provider_msg_idx').on(
      table.providerMessageId
    ),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Table: analytics_snapshots
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Daily pre-computed metrics rollup per merchant.
 *
 * WHY PRE-COMPUTE INSTEAD OF QUERY ON DEMAND?
 * The dashboard needs to display ₹X Recovered MRR, 78% recovery rate, etc.
 * Computing these in real-time from failed_payments + outreach_events on every
 * page load would require expensive COUNT/SUM aggregations over potentially
 * millions of rows. Pre-computing daily snapshots makes the dashboard instant.
 *
 * HOW: A scheduled BullMQ job runs at midnight IST (18:30 UTC) and writes one
 * row per merchant per day. Dashboard queries hit this table, not the raw tables.
 *
 * WHY BIGINT FOR AMOUNT COLUMNS?
 * integer max is ~2.1 billion (₹21,000,000 / ₹2.1 Crore). A merchant recovering
 * ₹3 Crore monthly would overflow. bigint handles up to ~9.2 quadrillion.
 */
export const analyticsSnapshots = pgTable(
  'analytics_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),

    // The calendar date this snapshot covers (no time component — always day-level)
    snapshotDate: date('snapshot_date').notNull(),

    // Revenue metrics in PAISE (bigint for large merchant volumes)
    failedAmountPaise: bigint('failed_amount_paise', { mode: 'number' }).default(0).notNull(),
    recoveredAmountPaise: bigint('recovered_amount_paise', { mode: 'number' }).default(0).notNull(),
    atRiskAmountPaise: bigint('at_risk_amount_paise', { mode: 'number' }).default(0).notNull(),

    // Payment counts
    failedPaymentsCount: integer('failed_payments_count').default(0).notNull(),
    recoveredPaymentsCount: integer('recovered_payments_count').default(0).notNull(),
    activeRecoveryJobsCount: integer('active_recovery_jobs_count').default(0).notNull(),

    /**
     * Recovery rate as 0-100 percentage.
     * numeric(5,2) allows values like 78.34% without float imprecision.
     * (5 total digits, 2 decimal places)
     */
    recoveryRatePct: numeric('recovery_rate_pct', { precision: 5, scale: 2 }).default('0').notNull(),

    // Channel attribution breakdown (how many recoveries came from each channel)
    // WHY: Helps merchants understand which channel is most effective for their customers
    recoveredViaEmail: integer('recovered_via_email').default(0).notNull(),
    recoveredViaWhatsapp: integer('recovered_via_whatsapp').default(0).notNull(),
    recoveredViaSms: integer('recovered_via_sms').default(0).notNull(),
    recoveredViaAutoRetry: integer('recovered_via_auto_retry').default(0).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    /**
     * One snapshot per merchant per day.
     * WHY UNIQUE: Idempotent upserts — the daily job can run multiple times without
     * creating duplicate rows. Uses ON CONFLICT DO UPDATE to refresh the snapshot.
     */
    merchantDateUniq: uniqueIndex('analytics_snapshots_merchant_date_uniq').on(
      table.merchantId,
      table.snapshotDate
    ),

    // Date range queries for charts (last 30 days, last 90 days)
    merchantDateIdx: index('analytics_snapshots_merchant_date_idx').on(
      table.merchantId,
      table.snapshotDate
    ),
  })
);
