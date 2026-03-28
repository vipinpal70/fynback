/**
 * schema/campaigns.ts
 *
 * Database tables for the campaign (dunning sequence) engine.
 *
 * OVERVIEW:
 * A "campaign" is a configured dunning sequence — a series of timed messages
 * sent to customers after a payment fails. There are two layers:
 *
 *   TEMPLATE LAYER (configuration):
 *     campaign_templates  → the sequence definition (name, plan, steps count)
 *     campaign_steps      → individual steps (day offset, channel, pause offer flag)
 *     message_templates   → content per step × channel (subject, html, text, variables)
 *
 *   EXECUTION LAYER (runtime):
 *     customers           → per-merchant customer records with validated contact state
 *     campaign_runs       → one active/completed instance per failed payment
 *     campaign_run_steps  → each scheduled/sent message within a run
 *
 * RELATIONSHIPS:
 *   merchant → campaign_templates (system defaults have merchant_id = NULL)
 *   campaign_template → campaign_steps → message_templates
 *   failed_payment → campaign_run → campaign_run_steps
 *   campaign_run_step → outreach_events (after send)
 *
 * PLAN LIMITS:
 *   trial/starter → 3 steps max, system default only
 *   growth        → 5 steps max, 1 merchant master campaign
 *   scale         → 15 steps max, 5 merchant master campaigns
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  pgEnum,
  jsonb,
  uniqueIndex,
  index,
  customType,
} from 'drizzle-orm/pg-core';

import { merchants } from './merchants';
import { failedPayments, outreachEvents } from './payments';

// text[] column type (Drizzle doesn't ship a first-class pg array helper yet)
const textArray = customType<{ data: string[]; driverData: string }>({
  dataType() { return 'text[]'; },
  toDriver(val) { return `{${val.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(',')}}`; },
  fromDriver(val) {
    if (!val || val === '{}') return [];
    return val.replace(/^\{|\}$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '').replace(/\\"/g, '"'));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether a campaign template was created by the system or a merchant.
 * WHY ENUM: Guards against the template logic accidentally treating a
 * merchant-created template as an uneditable system default.
 */
export const campaignTypeEnum = pgEnum('campaign_type', [
  'system_default',
  'merchant_master',
]);

/**
 * The outreach channel for a campaign step or run step.
 * WHY SEPARATE FROM outreachChannelEnum in payments.ts:
 * This enum is used in campaign configuration context (what channel a STEP
 * prefers). outreachChannelEnum is used in the outreach_events log (what
 * channel was actually used). Keeping them separate lets us evolve them
 * independently — e.g., adding 'in_app' to campaigns without affecting logs.
 */
export const campaignChannelEnum = pgEnum('campaign_channel', [
  'email',
  'whatsapp',
  'sms',
]);

/**
 * Status of a merchant's pause offer response.
 * NULL means no pause offer was sent yet for this run.
 */
export const pauseOfferStatusEnum = pgEnum('pause_offer_status', [
  'pending',    // Pause offer sent, awaiting merchant decision
  'approved',   // Merchant approved → subscription should be paused
  'rejected',   // Merchant rejected → campaign continues
]);

/**
 * Lifecycle state of an active campaign run.
 *
 * FLOW (happy path):  active → recovered
 * FLOW (exhausted):  active → exhausted
 * FLOW (cancelled):  active → cancelled (duplicate amount, manual cancel)
 * FLOW (paused):     active → paused (merchant paused) → active (resumed)
 */
export const campaignRunStatusEnum = pgEnum('campaign_run_status', [
  'active',
  'paused',
  'recovered',
  'exhausted',
  'cancelled',
]);

/**
 * State of a single scheduled message within a campaign run.
 */
export const runStepStatusEnum = pgEnum('run_step_status', [
  'scheduled',   // BullMQ job enqueued, not yet fired
  'sent',        // Message dispatched to provider
  'delivered',   // Provider confirmed delivery
  'failed',      // Provider send failed (bad number, email bounced, etc.)
  'skipped',     // Step skipped (channel not available for this customer)
  'cancelled',   // Run recovered or cancelled before this step fired
]);

// ─────────────────────────────────────────────────────────────────────────────
// Table: customers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-merchant customer record with validated contact channel state.
 *
 * WHY SEPARATE FROM failed_payments customer fields?
 * failed_payments denormalizes customer info for fast job processing.
 * This table is the VALIDATED source of truth: email MX check results,
 * WhatsApp availability, and historical contact data across multiple failures.
 *
 * WHY has_whatsapp IS NULLABLE (not just boolean)?
 * NULL = not yet checked (new customer, check pending)
 * TRUE = Meta Business API confirmed WhatsApp account exists
 * FALSE = Meta Business API confirmed no WhatsApp account
 * This lets us distinguish "unknown" from "definitely no WhatsApp".
 *
 * WHY UNIQUE(merchant_id, email)?
 * PostgreSQL NULL values don't violate unique constraints — so customers
 * with only a phone number (null email) won't conflict with each other.
 * This uniqueness is per-merchant: same customer email can exist for
 * two different merchants.
 */
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),

    // Gateway-assigned customer identifier (e.g. Razorpay cust_xxx, Stripe cus_xxx)
    // Not unique: same customer may have different IDs across gateways
    gatewayCustomerId: varchar('gateway_customer_id', { length: 255 }),

    // Contact channels — either or both may be present
    email: varchar('email', { length: 320 }),
    phone: varchar('phone', { length: 20 }),
    name: varchar('name', { length: 255 }),

    /**
     * Whether the email address passed MX/DNS validation.
     * FALSE = hard bounce risk, skip email channel for this customer.
     * WHY TRACK: Sending to invalid emails hurts sender reputation with Resend.
     */
    emailValid: boolean('email_valid').default(true).notNull(),

    /**
     * Whether this phone number has an active WhatsApp account.
     * NULL = not yet checked (channel-validator job pending).
     * Checked via Meta Business API (phone number lookup endpoint).
     */
    hasWhatsapp: boolean('has_whatsapp'),
    whatsappCheckedAt: timestamp('whatsapp_checked_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Primary dedup key: one record per email per merchant
    merchantEmailIdx: uniqueIndex('customers_merchant_email_idx').on(
      table.merchantId,
      table.email
    ),

    // Lookup by phone (for customers with phone only)
    merchantPhoneIdx: index('customers_merchant_phone_idx').on(
      table.merchantId,
      table.phone
    ),

    // Lookup by gateway customer ID (for linking failures back to this record)
    gatewayCustomerIdx: index('customers_gateway_customer_idx').on(
      table.merchantId,
      table.gatewayCustomerId
    ),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Table: campaign_templates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Defines a dunning sequence: name, plan requirement, and how many steps it has.
 *
 * System defaults (merchant_id = NULL):
 *   'system_trial_default'   → 3 steps, plan_required = trial
 *   'system_starter_default' → 3 steps, plan_required = starter
 *   'system_growth_default'  → 5 steps, plan_required = growth
 *   'system_scale_default'   → 5 steps, plan_required = scale (up to 15)
 *
 * Merchant master campaigns (merchant_id = UUID):
 *   Growth merchants can create 1 master campaign.
 *   Scale merchants can create up to 5 master campaigns.
 *   A master campaign replaces the system default for that merchant.
 *
 * WHY decline_category_filter AS JSONB?
 * A campaign can target specific failure reasons (e.g., a different message
 * for 'card_expired' vs 'insufficient_funds'). NULL means "applies to all".
 * JSONB stores ['soft_decline', 'bank_decline'] etc. for flexible filtering.
 *
 * WHY pause_offer_step?
 * Growth plan includes a pause offer at a configurable step (default: step 3).
 * We store the step number here at the template level so merchants can
 * adjust it without rebuilding the entire sequence.
 */
export const campaignTemplates = pgTable(
  'campaign_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // NULL for system defaults; merchant UUID for merchant master campaigns
    merchantId: uuid('merchant_id').references(() => merchants.id, {
      onDelete: 'cascade',
    }),

    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),

    type: campaignTypeEnum('type').notNull(),

    /**
     * Minimum plan required to use this template.
     * System defaults: matched to the plan they were designed for.
     * Merchant masters: always matches the merchant's current plan.
     * WHY VARCHAR (not enum FK): Avoids importing planTierEnum from merchants.ts
     * and creating a cross-schema import cycle.
     */
    planRequired: varchar('plan_required', { length: 20 }).notNull(),

    /**
     * Which failure reasons this template handles.
     * NULL = handles all failure reasons (general purpose template).
     * ['card_expired'] = only fires for expired card failures.
     * WHY: Merchants may want different messaging for "your card expired"
     * vs "insufficient funds" — completely different customer actions required.
     */
    declineCategoryFilter: jsonb('decline_category_filter'),

    isActive: boolean('is_active').default(true).notNull(),
    isPaused: boolean('is_paused').default(false).notNull(),

    /**
     * Maximum number of steps this template supports.
     * Enforced at template creation time based on merchant plan:
     *   trial/starter: 3
     *   growth:        5
     *   scale:         15
     */
    maxSteps: integer('max_steps').notNull(),

    /**
     * Which step number (1-indexed) carries the pause offer message.
     * NULL = no pause offer in this template (trial/starter).
     * Growth default = 3 (day 4). Merchant can change this.
     */
    pauseOfferStep: integer('pause_offer_step'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Find all templates for a merchant (including system defaults via NULL merchantId)
    merchantIdx: index('campaign_templates_merchant_idx').on(table.merchantId),

    // Find active templates for a plan
    planActiveIdx: index('campaign_templates_plan_active_idx').on(
      table.planRequired,
      table.isActive
    ),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Table: campaign_steps
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Individual steps within a campaign template.
 *
 * Each step defines WHEN to send (day_offset) and WHAT CHANNEL to prefer
 * (preferred_channel). The actual message content lives in message_templates.
 *
 * WHY preferred_channel (not required_channel)?
 * The campaign runner may downgrade the channel based on customer contact info:
 *   - preferred=whatsapp but customer has no WhatsApp → fall back to SMS
 *   - preferred=email but email is invalid → fall back to WhatsApp/SMS
 * "Preferred" communicates intent; "used" is recorded in campaign_run_steps.
 *
 * WHY is_pause_offer AS A STEP FLAG (not derived from template)?
 * Separating the pause offer from the template-level pauseOfferStep allows
 * merchants to mark any step as a pause offer step during custom template
 * creation, without the system needing to re-derive it on every run.
 */
export const campaignSteps = pgTable(
  'campaign_steps',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    campaignTemplateId: uuid('campaign_template_id')
      .notNull()
      .references(() => campaignTemplates.id, { onDelete: 'cascade' }),

    // 1-indexed (Step 1 = first message, Step 3 = final message for trial)
    stepNumber: integer('step_number').notNull(),

    /**
     * Days after the payment failure to send this message.
     * Trial/Starter: 0, 2, 4
     * Growth:        0, 2, 4, 6, 8
     * Scale:         merchant-configured
     */
    dayOffset: integer('day_offset').notNull(),

    preferredChannel: campaignChannelEnum('preferred_channel').notNull(),

    /**
     * All channels this step should send on (may be more than one).
     * Example: ['email', 'whatsapp'] — send both on the same day.
     * The worker creates one BullMQ job per channel with the same delay.
     * Intersected with channelsActive at run time (skips channels the customer lacks).
     * Defaults to ['email'] for backward compatibility.
     */
    channels: textArray('channels').notNull().default(['email']),

    /**
     * Whether this step includes the pause offer section in the message.
     * Growth default: step 3 (day 4). Merchant-configurable.
     * WHY ON STEP (not only template): Allows future A/B testing of
     * pause offer placement across different steps.
     */
    isPauseOffer: boolean('is_pause_offer').default(false).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // One step number per template
    templateStepUniq: uniqueIndex('campaign_steps_template_step_uniq').on(
      table.campaignTemplateId,
      table.stepNumber
    ),

    templateIdx: index('campaign_steps_template_idx').on(table.campaignTemplateId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Table: message_templates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Message content for a specific step × channel combination.
 *
 * WHY ONE ROW PER STEP × CHANNEL?
 * Email, WhatsApp, and SMS have completely different content requirements:
 *   Email:    HTML body, plain-text fallback, subject line, brand color
 *   WhatsApp: Pre-approved Meta template with {{1}}, {{2}} variable slots
 *   SMS:      Short plain text, DLT template ID required for India
 * Separate rows let each channel be optimized without affecting others.
 *
 * WHY variables AS JSONB?
 * Templates use placeholder variables like {{customer_name}}, {{amount}},
 * {{payment_link}}, {{merchant_name}}. The variables field documents which
 * placeholders the body uses, enabling the preview renderer to substitute
 * sample values for the live preview in the dashboard.
 *
 * WHY is_ai_generated?
 * Scale plan merchants can generate templates via AI. Flagging AI-generated
 * content lets us track adoption and quality, and lets the merchant know
 * which templates need human review before going live.
 */
export const messageTemplates = pgTable(
  'message_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    campaignStepId: uuid('campaign_step_id')
      .notNull()
      .references(() => campaignSteps.id, { onDelete: 'cascade' }),

    channel: campaignChannelEnum('channel').notNull(),

    // Email-specific fields
    subject: varchar('subject', { length: 200 }),
    bodyHtml: text('body_html'),

    // All channels: plain text version
    // For WhatsApp: this IS the message (must match Meta-approved template format)
    // For SMS: this IS the message (must match DLT-registered template)
    // For Email: plain-text fallback for clients that don't render HTML
    bodyText: text('body_text'),

    /**
     * Template variable names used in the body.
     * Example: ["customer_name", "amount", "payment_link", "merchant_name"]
     * Used by the preview renderer to substitute sample values in the dashboard.
     */
    variables: jsonb('variables').default('[]').notNull(),

    isAiGenerated: boolean('is_ai_generated').default(false).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // One template per step per channel
    stepChannelUniq: uniqueIndex('message_templates_step_channel_uniq').on(
      table.campaignStepId,
      table.channel
    ),

    stepIdx: index('message_templates_step_idx').on(table.campaignStepId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Table: campaign_runs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row per active/completed campaign execution for a failed payment.
 *
 * WHY UNIQUE(failed_payment_id)?
 * Each failed payment should have at most one campaign run at a time.
 * The campaign-scheduler checks this constraint before creating a new run:
 *   - Same customer, same amount → no new run (continue existing)
 *   - Same customer, different amount → cancel old run, create new one
 *
 * WHY channels_active AS JSONB?
 * The active channels for a run are determined at creation time based on
 * the customer's available and validated contact info. Storing this in the
 * run (not re-deriving every step) ensures consistency if contact info
 * changes mid-sequence.
 * Example values: ['email', 'whatsapp'] | ['email'] | ['whatsapp', 'sms']
 *
 * WHY pause_offer_status ON THE RUN (not on the step)?
 * There is only ever one pause offer per campaign run. Tracking it here
 * makes it easy to query "all runs awaiting merchant pause decision"
 * without joining to campaign_run_steps.
 */
export const campaignRuns = pgTable(
  'campaign_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),

    failedPaymentId: uuid('failed_payment_id')
      .notNull()
      .references(() => failedPayments.id, { onDelete: 'cascade' }),

    campaignTemplateId: uuid('campaign_template_id')
      .notNull()
      .references(() => campaignTemplates.id),

    // Linked customer record (may be null if customer wasn't upserted yet)
    customerId: uuid('customer_id').references(() => customers.id, {
      onDelete: 'set null',
    }),

    status: campaignRunStatusEnum('status').default('active').notNull(),

    /**
     * Which channels are active for this run, determined at creation.
     * ['email', 'whatsapp'] | ['email'] | ['whatsapp', 'sms'] | ['sms']
     */
    channelsActive: jsonb('channels_active').default('["email"]').notNull(),

    // Progress tracking
    currentStep: integer('current_step').default(0).notNull(),
    totalSteps: integer('total_steps').notNull(),

    // Pause offer state (Growth+ only)
    pauseOfferSent: boolean('pause_offer_sent').default(false).notNull(),
    pauseOfferStatus: pauseOfferStatusEnum('pause_offer_status'),

    /**
     * Whether we've sent the payday dashboard notification to the merchant.
     * Growth plan: at end of sequence, send a "retry on payday" reminder.
     * This is a one-time dashboard notification (not a customer message).
     */
    paydayNotificationSent: boolean('payday_notification_sent').default(false).notNull(),

    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // One campaign run per failed payment (enforced at DB level)
    failedPaymentUniq: uniqueIndex('campaign_runs_failed_payment_uniq').on(
      table.failedPaymentId
    ),

    // Dashboard query: "show all active runs for this merchant"
    merchantStatusIdx: index('campaign_runs_merchant_status_idx').on(
      table.merchantId,
      table.status
    ),

    // Lookup by customer (for concurrent-failure dedup check)
    customerIdx: index('campaign_runs_customer_idx').on(table.customerId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Table: campaign_run_steps
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Each individual scheduled or sent message within a campaign run.
 *
 * WHY A ROW PER STEP (not just tracking in campaign_runs)?
 * Multiple steps are scheduled in advance as delayed BullMQ jobs.
 * We need to track each step's BullMQ job ID to cancel it if the
 * payment is recovered before the step fires.
 *
 * WHY bullmq_job_id HERE?
 * When a payment is recovered mid-campaign, we must cancel all future
 * scheduled steps. By storing the BullMQ job ID on each step row, the
 * recovery handler can bulk-cancel all 'scheduled' steps for a run
 * using BullMQ's job.remove(id) API.
 *
 * WHY outreach_event_id?
 * After a step is sent, the worker creates an outreach_event record
 * (for delivery/open/click tracking). Linking back here lets the dashboard
 * show "step 2 — delivered, opened, clicked" without extra queries.
 */
export const campaignRunSteps = pgTable(
  'campaign_run_steps',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    campaignRunId: uuid('campaign_run_id')
      .notNull()
      .references(() => campaignRuns.id, { onDelete: 'cascade' }),

    // The template step this run step was generated from
    campaignStepId: uuid('campaign_step_id')
      .notNull()
      .references(() => campaignSteps.id),

    // Which message template was used (may differ from step's preferred if channel switched)
    messageTemplateId: uuid('message_template_id').references(() => messageTemplates.id, {
      onDelete: 'set null',
    }),

    stepNumber: integer('step_number').notNull(),

    // The channel actually used (may differ from preferred if fallback occurred)
    channelUsed: campaignChannelEnum('channel_used').notNull(),

    status: runStepStatusEnum('status').default('scheduled').notNull(),

    // When this step's message is scheduled to fire
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),

    /**
     * BullMQ job ID for this step's delayed job.
     * Used to cancel the job via bullmq queue.remove(bullmqJobId) on recovery.
     * NULL if the step was executed synchronously or BullMQ job wasn't stored yet.
     */
    bullmqJobId: varchar('bullmq_job_id', { length: 255 }),

    /**
     * Links to the outreach_events row created when this step was sent.
     * NULL until the step fires and the message is dispatched.
     * Used to pull delivery/open/click status for dashboard preview.
     */
    outreachEventId: uuid('outreach_event_id').references(() => outreachEvents.id, {
      onDelete: 'set null',
    }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // All steps for a run (main query pattern: "get all steps for this run")
    runIdx: index('campaign_run_steps_run_idx').on(table.campaignRunId),

    // Find scheduled steps (used by recovery handler to bulk-cancel)
    runStatusIdx: index('campaign_run_steps_run_status_idx').on(
      table.campaignRunId,
      table.status
    ),

    // Find step by BullMQ job ID (needed for job completion callbacks)
    bullmqJobIdx: index('campaign_run_steps_bullmq_job_idx').on(table.bullmqJobId),
  })
);
