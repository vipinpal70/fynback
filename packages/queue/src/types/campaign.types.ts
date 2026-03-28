/**
 * campaign.types.ts
 *
 * TypeScript types for campaign (dunning sequence) BullMQ jobs.
 *
 * JOB FLOW:
 *
 *   payment fails (webhook)
 *     → ValidateCustomerChannelsJobData   (check email MX + WhatsApp API)
 *       → ScheduleCampaignJobData         (pick template, create run, schedule steps)
 *         → ExecuteCampaignStepJobData    (fires at each scheduled day — sends message)
 *
 *   payment recovers (webhook)
 *     → CancelCampaignRunJobData          (cancel all pending steps for this run)
 *
 *   cron: 1st + 25th of month
 *     → PaydayNotifyJobData               (send dashboard notification for exhausted runs)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Job 1: Validate customer channels
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates the customer's contact channels before scheduling a campaign.
 *
 * WHAT IT DOES:
 *   1. MX/DNS check on the email address (marks emailValid = false on hard fail)
 *   2. Meta Business API lookup to check if the phone has a WhatsApp account
 *
 * WHY ASYNC (not inline at webhook time)?
 * Email MX checks and Meta API calls take 200-800ms each. Doing them inline
 * in the webhook handler would delay the 200 response to the gateway, risking
 * retries and duplicate events. Offloading to a queue job keeps webhooks fast.
 *
 * WHY BEFORE SCHEDULING?
 * The channel selection (email+whatsapp / email only / sms fallback) must be
 * resolved before creating the campaign_run — channelsActive is set at run
 * creation and doesn't change mid-sequence. Validation must come first.
 */
export interface ValidateCustomerChannelsJobData {
  type: 'validate_customer_channels';

  // Identifiers
  failedPaymentId: string;
  merchantId: string;

  // Customer contact info from the failed payment (may be null if not provided)
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  gatewayCustomerId?: string;

  // Payment context (passed through to ScheduleCampaignJobData)
  amountPaise: number;
  currency: string;
  declineCategory: string;
  planRequired: string;  // Merchant's current plan (trial|starter|growth|scale)
}

// ─────────────────────────────────────────────────────────────────────────────
// Job 2: Schedule a campaign
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Picks the right campaign template, creates the campaign_run + run_steps,
 * and enqueues all step jobs with their correct delays.
 *
 * CALLED BY: channel-validator worker (after validation completes)
 *
 * WHAT IT DOES:
 *   1. Dedup check — is there already an active run for this customer?
 *      - Same amount → skip (continue existing campaign)
 *      - Different amount → cancel old run, proceed with new one
 *   2. Pick template (merchant master → system default precedence)
 *   3. Determine final channelsActive from validated contact info
 *   4. Create campaign_run in DB
 *   5. Create campaign_run_steps in DB (one per template step)
 *   6. Enqueue ExecuteCampaignStepJobData with delay = dayOffset * 24h for each step
 */
export interface ScheduleCampaignJobData {
  type: 'schedule_campaign';

  failedPaymentId: string;
  merchantId: string;
  customerId: string;           // UUID from customers table (created by validator)

  // Validated contact state (determined by channel-validator)
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  emailValid: boolean;
  hasWhatsapp: boolean | null;

  // Payment context
  amountPaise: number;
  currency: string;
  declineCategory: string;
  planRequired: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Job 3: Execute a single campaign step (send the message)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fires at the scheduled time to send one dunning message to the customer.
 * This is a delayed BullMQ job — the delay = dayOffset * 24 * 60 * 60 * 1000 ms.
 *
 * WHAT IT DOES:
 *   1. Load campaign_run — if recovered/cancelled, skip (idempotency guard)
 *   2. Load message template for this step × channel
 *   3. Substitute {{variables}} with real values
 *   4. Send via Resend (email), Interakt (WhatsApp), or MSG91 (SMS)
 *   5. Create outreach_event record with provider message ID
 *   6. Update campaign_run_step: status = sent, outreach_event_id = ...
 *   7. Update campaign_run: currentStep = this step number
 *   8. If this is the pause offer step → set pauseOfferSent = true, notify merchant
 *   9. If this is the final step → set status = exhausted, notify merchant
 */
export interface ExecuteCampaignStepJobData {
  type: 'execute_campaign_step';

  // The specific run step to execute
  campaignRunId: string;
  campaignRunStepId: string;
  campaignStepId: string;
  messageTemplateId: string;

  // Context for the message
  failedPaymentId: string;
  merchantId: string;
  customerId: string;

  stepNumber: number;
  totalSteps: number;
  isPauseOffer: boolean;
  isFinalStep: boolean;

  // Channel to use (already resolved at schedule time)
  channel: 'email' | 'whatsapp' | 'sms';

  // Customer contact
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;

  // Payment context (for variable substitution in the message)
  amountPaise: number;
  currency: string;

  // Merchant branding (fetched at schedule time to avoid DB hit at send time)
  merchantFromName: string;
  merchantFromEmail: string;
  merchantReplyTo: string;
  merchantBrandColor: string;
  merchantCompanyName: string;
  merchantCheckoutUrl: string;   // The payment link sent to the customer
  merchantLogoUrl?: string;       // Brand logo shown in email header
  merchantCompanyTagline?: string; // Value hook shown above email body (e.g. "Your winter collection awaits")
}

// ─────────────────────────────────────────────────────────────────────────────
// Job 4: Cancel a campaign run (on payment recovery)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cancels all pending (scheduled but not yet sent) steps of a campaign run.
 * Triggered by the recovery webhook when a payment succeeds.
 *
 * WHAT IT DOES:
 *   1. Get all campaign_run_steps with status = 'scheduled'
 *   2. For each: call BullMQ queue.remove(bullmqJobId) to cancel the delayed job
 *   3. Bulk-update step statuses to 'cancelled'
 *   4. Update campaign_run: status = recovered, completedAt = now
 *   5. Send recovery confirmation to customer (email/whatsapp/sms)
 *   6. Send recovery notification to merchant
 */
export interface CancelCampaignRunJobData {
  type: 'cancel_campaign_run';

  campaignRunId: string;
  failedPaymentId: string;
  merchantId: string;
  customerId?: string;

  // For recovery confirmation message
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  amountPaise: number;
  currency: string;

  // Merchant info for notification
  merchantFromEmail: string;
  merchantFromName: string;
  merchantCompanyName: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Job 5: Payday notification (cron: 1st + 25th of month)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a dashboard notification to the merchant for each exhausted campaign
 * that hasn't received a payday payment retry yet.
 *
 * Growth plan feature: after the sequence exhausts, FynBack sends one final
 * dashboard alert on payday (1st or 25th of month) reminding the merchant to
 * manually reach out or retry on the customer's salary day.
 *
 * This is a dashboard-only notification (not sent to the customer).
 */
export interface PaydayNotifyJobData {
  type: 'payday_notify';
  merchantId: string;

  /**
   * List of exhausted campaign runs awaiting payday notification.
   * Each entry includes enough context to render the dashboard notification.
   */
  exhaustedRuns: Array<{
    campaignRunId: string;
    failedPaymentId: string;
    customerName?: string;
    customerEmail?: string;
    amountPaise: number;
    currency: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Union type
// ─────────────────────────────────────────────────────────────────────────────

export type CampaignJobData =
  | ValidateCustomerChannelsJobData
  | ScheduleCampaignJobData
  | ExecuteCampaignStepJobData
  | CancelCampaignRunJobData
  | PaydayNotifyJobData;
