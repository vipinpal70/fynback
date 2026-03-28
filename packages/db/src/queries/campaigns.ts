/**
 * queries/campaigns.ts
 *
 * All database queries for the campaign (dunning sequence) engine.
 *
 * QUERY GROUPS:
 *   customers         → upsert, validate, check WhatsApp
 *   campaign_templates → pick template for a failure, CRUD for merchant masters
 *   campaign_runs      → create, update, get active run per customer
 *   campaign_run_steps → schedule steps, bulk-cancel on recovery
 */

import { eq, and, isNull, inArray, desc, sql } from 'drizzle-orm';
import type { Database } from '../index';
import {
  customers,
  campaignTemplates,
  campaignSteps,
  messageTemplates,
  campaignRuns,
  campaignRunSteps,
} from '../schema/campaigns';
import { failedPayments } from '../schema/payments';

// ─────────────────────────────────────────────────────────────────────────────
// Customers
// ─────────────────────────────────────────────────────────────────────────────

export const campaignQueries = {

  /**
   * Upserts a customer record from a failed payment webhook.
   *
   * WHY UPSERT: The same customer may have multiple payment failures.
   * We want one canonical record per (merchant, email) with the latest contact info.
   * ON CONFLICT updates only the fields that might have changed (name, phone).
   */
  upsertCustomer: async (
    db: Database,
    data: {
      merchantId: string;
      gatewayCustomerId?: string;
      email?: string;
      phone?: string;
      name?: string;
    }
  ) => {
    const rows = await db
      .insert(customers)
      .values({
        merchantId: data.merchantId,
        gatewayCustomerId: data.gatewayCustomerId ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        name: data.name ?? null,
      })
      .onConflictDoUpdate({
        target: [customers.merchantId, customers.email],
        set: {
          phone: data.phone ?? null,
          name: data.name ?? null,
          gatewayCustomerId: data.gatewayCustomerId ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return rows[0] ?? null;
  },

  /**
   * Marks a customer's email as invalid (from MX check or bounce).
   * Future campaign runs will skip the email channel for this customer.
   */
  markEmailInvalid: async (db: Database, customerId: string) => {
    return db
      .update(customers)
      .set({ emailValid: false, updatedAt: new Date() })
      .where(eq(customers.id, customerId));
  },

  /**
   * Saves the WhatsApp availability result from the Meta Business API check.
   */
  saveWhatsappCheckResult: async (
    db: Database,
    customerId: string,
    hasWhatsapp: boolean
  ) => {
    return db
      .update(customers)
      .set({
        hasWhatsapp,
        whatsappCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(customers.id, customerId));
  },

  /**
   * Finds a customer by merchantId + email (primary lookup key).
   */
  getCustomerByEmail: async (
    db: Database,
    merchantId: string,
    email: string
  ) => {
    const rows = await db
      .select()
      .from(customers)
      .where(and(eq(customers.merchantId, merchantId), eq(customers.email, email)))
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * Finds a customer by merchantId + phone (used when email is absent).
   */
  getCustomerByPhone: async (
    db: Database,
    merchantId: string,
    phone: string
  ) => {
    const rows = await db
      .select()
      .from(customers)
      .where(and(eq(customers.merchantId, merchantId), eq(customers.phone, phone)))
      .limit(1);
    return rows[0] ?? null;
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Campaign Templates
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Picks the best campaign template for a given merchant + plan + failure reason.
   *
   * SELECTION PRIORITY:
   *   1. Merchant master campaign matching the decline category (most specific)
   *   2. Merchant master campaign with no filter (general merchant custom)
   *   3. System default for the merchant's plan
   *
   * WHY THIS ORDER: Merchant customizations should always take precedence,
   * but only when they match the failure reason. If the merchant has a
   * "card expired" specific campaign, use that for expired cards.
   * Otherwise fall back to their general master campaign or the system default.
   */
  pickCampaignTemplate: async (
    db: Database,
    merchantId: string,
    planRequired: string,
    declineCategory: string
  ) => {
    // Step 1: Merchant master, matching the decline category
    const merchantSpecific = await db
      .select()
      .from(campaignTemplates)
      .where(
        and(
          eq(campaignTemplates.merchantId, merchantId),
          eq(campaignTemplates.isActive, true),
          eq(campaignTemplates.isPaused, false),
          sql`${campaignTemplates.declineCategoryFilter} @> ${JSON.stringify([declineCategory])}::jsonb`
        )
      )
      .limit(1);

    if (merchantSpecific[0]) return merchantSpecific[0];

    // Step 2: Merchant master, no filter (general)
    const merchantGeneral = await db
      .select()
      .from(campaignTemplates)
      .where(
        and(
          eq(campaignTemplates.merchantId, merchantId),
          eq(campaignTemplates.isActive, true),
          eq(campaignTemplates.isPaused, false),
          isNull(campaignTemplates.declineCategoryFilter)
        )
      )
      .limit(1);

    if (merchantGeneral[0]) return merchantGeneral[0];

    // Step 3: System default for this plan
    const systemDefault = await db
      .select()
      .from(campaignTemplates)
      .where(
        and(
          isNull(campaignTemplates.merchantId),
          eq(campaignTemplates.planRequired, planRequired),
          eq(campaignTemplates.isActive, true)
        )
      )
      .limit(1);

    return systemDefault[0] ?? null;
  },

  /**
   * Gets all steps for a campaign template, ordered by step number.
   */
  getCampaignSteps: async (db: Database, campaignTemplateId: string) => {
    return db
      .select()
      .from(campaignSteps)
      .where(eq(campaignSteps.campaignTemplateId, campaignTemplateId))
      .orderBy(campaignSteps.stepNumber);
  },

  /**
   * Gets all message templates for a campaign step, keyed by channel.
   */
  getMessageTemplatesForStep: async (db: Database, campaignStepId: string) => {
    return db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.campaignStepId, campaignStepId));
  },

  /**
   * Gets a full campaign template with all its steps and message templates.
   * Used for the dashboard preview and template editor.
   */
  getCampaignTemplateWithSteps: async (db: Database, templateId: string) => {
    const template = await db
      .select()
      .from(campaignTemplates)
      .where(eq(campaignTemplates.id, templateId))
      .limit(1);

    if (!template[0]) return null;

    const steps = await db
      .select()
      .from(campaignSteps)
      .where(eq(campaignSteps.campaignTemplateId, templateId))
      .orderBy(campaignSteps.stepNumber);

    const stepIds = steps.map((s) => s.id);
    const messages = stepIds.length
      ? await db
          .select()
          .from(messageTemplates)
          .where(inArray(messageTemplates.campaignStepId, stepIds))
      : [];

    return {
      template: template[0],
      steps: steps.map((step) => ({
        ...step,
        messages: messages.filter((m) => m.campaignStepId === step.id),
      })),
    };
  },

  /**
   * Gets all campaign templates for a merchant (their master campaigns only).
   * Does NOT include system defaults — use getSystemDefaultTemplates for those.
   */
  getMerchantCampaignTemplates: async (db: Database, merchantId: string) => {
    return db
      .select()
      .from(campaignTemplates)
      .where(eq(campaignTemplates.merchantId, merchantId))
      .orderBy(desc(campaignTemplates.createdAt));
  },

  /**
   * Gets system default templates for a given plan.
   * System defaults have merchant_id = NULL and type = 'system_default'.
   *
   * WHY BY PLAN: Each plan tier has its own system default sequence.
   * trial/starter → 3-step gentle sequence
   * growth        → 5-step sequence with pause offer at step 3
   * scale         → 5-step sequence (same as growth to start; merchant adds more)
   *
   * Also includes lower-tier defaults so the merchant can see what they had before:
   * growth merchant sees growth + starter defaults (for reference)
   * scale merchant sees scale + growth + starter defaults
   * trial/starter merchant sees only their own default
   */
  getSystemDefaultTemplates: async (db: Database, plan: string) => {
    // Determine which plans to include based on merchant's current plan
    const plansToShow: string[] =
      plan === 'scale'  ? ['scale', 'growth', 'starter', 'trial'] :
      plan === 'growth' ? ['growth', 'starter', 'trial'] :
      plan === 'starter'? ['starter', 'trial'] :
      ['trial'];

    return db
      .select()
      .from(campaignTemplates)
      .where(
        and(
          isNull(campaignTemplates.merchantId),
          inArray(campaignTemplates.planRequired, plansToShow),
          eq(campaignTemplates.isActive, true)
        )
      )
      .orderBy(campaignTemplates.planRequired);
  },

  /**
   * Returns aggregate stats for a campaign template: how many runs, how many
   * recovered, how many currently active. Used on the dashboard strategy card.
   */
  getCampaignTemplateStats: async (
    db: Database,
    merchantId: string,
    templateId: string
  ) => {
    const rows = await db
      .select({
        totalRuns: sql<number>`count(*)::int`,
        recoveredRuns: sql<number>`count(*) filter (where status = 'recovered')::int`,
        activeRuns: sql<number>`count(*) filter (where status = 'active')::int`,
      })
      .from(campaignRuns)
      .where(
        and(
          eq(campaignRuns.merchantId, merchantId),
          eq(campaignRuns.campaignTemplateId, templateId)
        )
      );
    return rows[0] ?? { totalRuns: 0, recoveredRuns: 0, activeRuns: 0 };
  },

  /**
   * Counts how many active master campaigns a merchant has.
   * Used to enforce the Growth (max 1) and Scale (max 5) campaign limits.
   */
  countMerchantMasterCampaigns: async (db: Database, merchantId: string) => {
    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(campaignTemplates)
      .where(
        and(
          eq(campaignTemplates.merchantId, merchantId),
          eq(campaignTemplates.isActive, true)
        )
      );
    return Number(result[0]?.count ?? 0);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Campaign Runs
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Creates a new campaign run for a failed payment.
   * Called by the campaign-scheduler worker after picking a template.
   */
  createCampaignRun: async (
    db: Database,
    data: {
      merchantId: string;
      failedPaymentId: string;
      campaignTemplateId: string;
      customerId?: string;
      channelsActive: string[];
      totalSteps: number;
    }
  ) => {
    const rows = await db
      .insert(campaignRuns)
      .values({
        merchantId: data.merchantId,
        failedPaymentId: data.failedPaymentId,
        campaignTemplateId: data.campaignTemplateId,
        customerId: data.customerId ?? null,
        channelsActive: data.channelsActive,
        totalSteps: data.totalSteps,
        currentStep: 0,
        status: 'active',
        startedAt: new Date(),
      })
      .onConflictDoNothing({ target: campaignRuns.failedPaymentId })
      .returning();

    return rows[0] ?? null;
  },

  /**
   * Gets the active campaign run for a failed payment (if any).
   */
  getActiveCampaignRun: async (db: Database, failedPaymentId: string) => {
    const rows = await db
      .select()
      .from(campaignRuns)
      .where(
        and(
          eq(campaignRuns.failedPaymentId, failedPaymentId),
          eq(campaignRuns.status, 'active')
        )
      )
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * Gets any active campaign run for a customer (for concurrent-failure dedup).
   * Used by campaign-scheduler to check: "does this customer already have a
   * running campaign, and is it the same amount?"
   */
  getActiveRunForCustomer: async (db: Database, customerId: string) => {
    const rows = await db
      .select({
        run: campaignRuns,
        payment: {
          amountPaise: failedPayments.amountPaise,
        },
      })
      .from(campaignRuns)
      .innerJoin(failedPayments, eq(campaignRuns.failedPaymentId, failedPayments.id))
      .where(
        and(
          eq(campaignRuns.customerId, customerId),
          eq(campaignRuns.status, 'active')
        )
      )
      .limit(1);

    return rows[0] ?? null;
  },

  /**
   * Updates a campaign run's status and progress.
   */
  updateCampaignRun: async (
    db: Database,
    runId: string,
    update: {
      status?: typeof campaignRuns.$inferInsert['status'];
      currentStep?: number;
      pauseOfferSent?: boolean;
      pauseOfferStatus?: typeof campaignRuns.$inferInsert['pauseOfferStatus'];
      paydayNotificationSent?: boolean;
      completedAt?: Date;
    }
  ) => {
    return db
      .update(campaignRuns)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(campaignRuns.id, runId))
      .returning();
  },

  /**
   * Gets all campaign runs for a merchant, for the dashboard list.
   */
  getMerchantCampaignRuns: async (
    db: Database,
    merchantId: string,
    limit: number = 20,
    offset: number = 0
  ) => {
    return db
      .select()
      .from(campaignRuns)
      .where(eq(campaignRuns.merchantId, merchantId))
      .orderBy(desc(campaignRuns.startedAt))
      .limit(limit)
      .offset(offset);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Campaign Run Steps
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Bulk-inserts all scheduled steps for a new campaign run.
   * Called by campaign-scheduler immediately after creating the run.
   */
  createCampaignRunSteps: async (
    db: Database,
    steps: Array<{
      campaignRunId: string;
      campaignStepId: string;
      messageTemplateId?: string;
      stepNumber: number;
      channelUsed: 'email' | 'whatsapp' | 'sms';
      scheduledAt: Date;
      bullmqJobId?: string;
    }>
  ) => {
    if (steps.length === 0) return [];

    return db
      .insert(campaignRunSteps)
      .values(
        steps.map((s) => ({
          campaignRunId: s.campaignRunId,
          campaignStepId: s.campaignStepId,
          messageTemplateId: s.messageTemplateId ?? null,
          stepNumber: s.stepNumber,
          channelUsed: s.channelUsed,
          scheduledAt: s.scheduledAt,
          bullmqJobId: s.bullmqJobId ?? null,
          status: 'scheduled' as const,
        }))
      )
      .returning();
  },

  /**
   * Updates a run step's BullMQ job ID after the job is enqueued.
   * Called immediately after adding the delayed job to BullMQ.
   */
  updateRunStepBullmqJobId: async (
    db: Database,
    runStepId: string,
    bullmqJobId: string
  ) => {
    return db
      .update(campaignRunSteps)
      .set({ bullmqJobId, updatedAt: new Date() })
      .where(eq(campaignRunSteps.id, runStepId));
  },

  /**
   * Marks a run step as sent and links the outreach event.
   * Called by campaign-step-executor after dispatching the message.
   */
  markRunStepSent: async (
    db: Database,
    runStepId: string,
    outreachEventId: string
  ) => {
    return db
      .update(campaignRunSteps)
      .set({
        status: 'sent',
        sentAt: new Date(),
        outreachEventId,
        updatedAt: new Date(),
      })
      .where(eq(campaignRunSteps.id, runStepId));
  },

  /**
   * Updates a run step's status (delivered, failed, skipped, cancelled).
   */
  updateRunStepStatus: async (
    db: Database,
    runStepId: string,
    status: typeof campaignRunSteps.$inferInsert['status']
  ) => {
    return db
      .update(campaignRunSteps)
      .set({ status, updatedAt: new Date() })
      .where(eq(campaignRunSteps.id, runStepId));
  },

  /**
   * Gets all steps for a campaign run, ordered by step number.
   * Used by the dashboard to render the timeline.
   */
  getRunSteps: async (db: Database, campaignRunId: string) => {
    return db
      .select()
      .from(campaignRunSteps)
      .where(eq(campaignRunSteps.campaignRunId, campaignRunId))
      .orderBy(campaignRunSteps.stepNumber);
  },

  /**
   * Gets all scheduled (not yet sent) steps for a run.
   * Used by recovery-watcher to bulk-cancel pending steps when payment recovers.
   *
   * @returns rows with bullmqJobId for BullMQ cancellation
   */
  getScheduledRunSteps: async (db: Database, campaignRunId: string) => {
    return db
      .select({
        id: campaignRunSteps.id,
        bullmqJobId: campaignRunSteps.bullmqJobId,
        stepNumber: campaignRunSteps.stepNumber,
      })
      .from(campaignRunSteps)
      .where(
        and(
          eq(campaignRunSteps.campaignRunId, campaignRunId),
          eq(campaignRunSteps.status, 'scheduled')
        )
      );
  },

  /**
   * Bulk-cancels all scheduled steps for a run (called on payment recovery).
   */
  cancelAllScheduledRunSteps: async (db: Database, campaignRunId: string) => {
    return db
      .update(campaignRunSteps)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(campaignRunSteps.campaignRunId, campaignRunId),
          eq(campaignRunSteps.status, 'scheduled')
        )
      )
      .returning({ bullmqJobId: campaignRunSteps.bullmqJobId });
  },

  /**
   * Finds a run step by its BullMQ job ID.
   * Called at the start of campaign-step-executor to get the step context.
   */
  getRunStepByBullmqJobId: async (db: Database, bullmqJobId: string) => {
    const rows = await db
      .select()
      .from(campaignRunSteps)
      .where(eq(campaignRunSteps.bullmqJobId, bullmqJobId))
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * Gets all exhausted (completed sequence without recovery) campaign runs
   * where the payday notification has not been sent yet.
   * Used by the payday-notifier cron job on the 1st and 25th of each month.
   */
  getExhaustedRunsAwaitingPaydayNotification: async (
    db: Database,
    merchantId: string
  ) => {
    return db
      .select()
      .from(campaignRuns)
      .where(
        and(
          eq(campaignRuns.merchantId, merchantId),
          eq(campaignRuns.status, 'exhausted'),
          eq(campaignRuns.paydayNotificationSent, false)
        )
      );
  },
};
