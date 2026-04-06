/**
 * workers/campaign.worker.ts
 *
 * Processes all campaign (dunning sequence) jobs from campaignQueue and paydayQueue.
 *
 * JOB HANDLERS:
 *   validate_customer_channels  → MX check email + Meta WhatsApp API check
 *   schedule_campaign           → pick template, create run + steps, enqueue delayed jobs
 *   execute_campaign_step       → send email/WhatsApp/SMS at the scheduled time
 *   cancel_campaign_run         → cancel pending BullMQ jobs + send recovery confirmation
 *   payday_notify               → dashboard notification for exhausted runs on payday
 */

import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { Resend } from 'resend';
import {
  createDb,
  campaignQueries,
  paymentQueries,
  merchants,
  merchantBrandSettings,
  eq,
} from '@fynback/db';
import {
  campaignQueue,
  paydayQueue,
  type CampaignJobData,
  type ValidateCustomerChannelsJobData,
  type ScheduleCampaignJobData,
  type ExecuteCampaignStepJobData,
  type CancelCampaignRunJobData,
  type PaydayNotifyJobData,
} from '@fynback/queue';
import { formatINR } from '@fynback/shared';
import { decrypt } from '@fynback/crypto';
import {
  sendDunningWhatsApp,
  sendRecoveryConfirmationWhatsApp,
  assignInteraktChat,
} from '../lib/interakt';

// ─────────────────────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────────────────────

const db = createDb(process.env.DATABASE_URL!);
const resend = new Resend(process.env.RESEND_API_KEY!);

// ─────────────────────────────────────────────────────────────────────────────
// Worker startup
// ─────────────────────────────────────────────────────────────────────────────

export function startCampaignWorker(): { campaign: Worker; payday: Worker } {
  const workerRedis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
  });

  // Second connection for the payday queue worker
  const paydayRedis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
  });

  const campaign = new Worker<CampaignJobData>(
    'campaignQueue',
    processCampaignJob,
    { connection: workerRedis, concurrency: 10, lockDuration: 5 * 60 * 1000 }
  );

  const payday = new Worker(
    'paydayQueue',
    processPaydayJob,
    { connection: paydayRedis, concurrency: 2, lockDuration: 2 * 60 * 1000 }
  );

  campaign.on('completed', (job) =>
    console.log(`[CampaignWorker] Job ${job.id} (${job.data.type}) completed ✓`)
  );
  campaign.on('failed', (job, err) =>
    console.error(`[CampaignWorker] Job ${job?.id} (${job?.data?.type}) failed: ${err.message}`)
  );
  campaign.on('error', (err) =>
    console.error(`[CampaignWorker] Worker error: ${err.message}`)
  );
  payday.on('completed', (job) =>
    console.log(`[PaydayWorker] Job ${job.id} completed ✓`)
  );

  console.log('[CampaignWorker] Started — listening on campaignQueue + paydayQueue');
  return { campaign, payday };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────────────────────────────────────

async function processCampaignJob(job: Job<CampaignJobData>): Promise<void> {
  switch (job.data.type) {
    case 'validate_customer_channels':
      await handleValidateChannels(job as Job<ValidateCustomerChannelsJobData>);
      break;
    case 'schedule_campaign':
      await handleScheduleCampaign(job as Job<ScheduleCampaignJobData>);
      break;
    case 'execute_campaign_step':
      await handleExecuteStep(job as Job<ExecuteCampaignStepJobData>);
      break;
    case 'cancel_campaign_run':
      await handleCancelRun(job as Job<CancelCampaignRunJobData>);
      break;
    case 'payday_notify':
      await handlePaydayNotify(job as Job<PaydayNotifyJobData>);
      break;
    default: {
      const exhaustive: never = job.data;
      console.error(`[CampaignWorker] Unknown job type: ${(exhaustive as CampaignJobData).type}`);
    }
  }
}

async function processPaydayJob(job: Job): Promise<void> {
  // The payday queue triggers the campaign worker's payday handler
  await handlePaydayNotify(job as Job<PaydayNotifyJobData>);
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler 1: Validate customer channels
// ─────────────────────────────────────────────────────────────────────────────

async function handleValidateChannels(
  job: Job<ValidateCustomerChannelsJobData>
): Promise<void> {
  const data = job.data;
  console.log(`[CampaignWorker] Validating channels for payment ${data.failedPaymentId}`);

  // ── 1. Upsert customer record ───────────────────────────────────────────
  const customer = await campaignQueries.upsertCustomer(db, {
    merchantId: data.merchantId,
    gatewayCustomerId: data.gatewayCustomerId,
    email: data.customerEmail,
    phone: data.customerPhone,
    name: data.customerName,
  });

  if (!customer) {
    throw new Error(`Failed to upsert customer for payment ${data.failedPaymentId}`);
  }

  // ── 2. Validate email (MX check & placeholder block) ───────────────────
  let emailValid = true;
  if (data.customerEmail) {
    if (isPlaceholderEmail(data.customerEmail)) {
      emailValid = false;
      console.log(`[CampaignWorker] Email "${data.customerEmail}" is a gateway placeholder — marked invalid`);
    } else {
      emailValid = await checkEmailMx(data.customerEmail);
      if (!emailValid) {
        console.log(`[CampaignWorker] Email ${data.customerEmail} failed MX check — marked invalid`);
      }
    }

    if (!emailValid) {
      await campaignQueries.markEmailInvalid(db, customer.id);
    }
  }

  // ── 3. Check WhatsApp availability via Interakt ────────────────────────
  // Load the merchant's Interakt API key so we can use the Interakt user
  // lookup API — no separate Meta credentials needed.
  let hasWhatsapp: boolean | null = null;
  if (data.customerPhone) {
    let interaktKeyForCheck: string | undefined;
    try {
      const brandRow = await db
        .select({ interaktApiKeyEncrypted: merchantBrandSettings.interaktApiKeyEncrypted })
        .from(merchantBrandSettings)
        .where(eq(merchantBrandSettings.merchantId, data.merchantId))
        .limit(1);
      const enc = brandRow[0]?.interaktApiKeyEncrypted;
      if (enc) interaktKeyForCheck = decrypt(enc).trim() || undefined;
    } catch {
      // Key unavailable — proceed with null (optimistic fallback below)
    }

    hasWhatsapp = await checkWhatsAppAvailability(data.customerPhone, interaktKeyForCheck);

    // null = check couldn't run (no API key) → optimistic true so we try WhatsApp.
    // Interakt handles delivery failure; our SMS fallback covers the rest.
    const effectiveHasWhatsapp = hasWhatsapp ?? true;

    await campaignQueries.saveWhatsappCheckResult(db, customer.id, effectiveHasWhatsapp);
    console.log(
      `[CampaignWorker] WhatsApp check for ${data.customerPhone}: ` +
      `${hasWhatsapp === null ? 'skipped (no key)' : hasWhatsapp} → using ${effectiveHasWhatsapp}`
    );
    hasWhatsapp = effectiveHasWhatsapp;
  }

  // ── 4. Dispatch schedule_campaign job ──────────────────────────────────
  await campaignQueue.add(
    'schedule_campaign',
    {
      type: 'schedule_campaign',
      failedPaymentId: data.failedPaymentId,
      merchantId: data.merchantId,
      customerId: customer.id,
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone,
      customerName: data.customerName,
      emailValid,
      hasWhatsapp,
      amountPaise: data.amountPaise,
      currency: data.currency,
      declineCategory: data.declineCategory,
      planRequired: data.planRequired,
    } satisfies ScheduleCampaignJobData,
    { priority: 1 }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler 2: Schedule campaign
// ─────────────────────────────────────────────────────────────────────────────

async function handleScheduleCampaign(
  job: Job<ScheduleCampaignJobData>
): Promise<void> {
  const data = job.data;
  console.log(`[CampaignWorker] Scheduling campaign for payment ${data.failedPaymentId}`);

  // ── 0. Check if merchant has paused campaigns ───────────────────────────
  const merchantPauseRow = await db
    .select({ campaignsPaused: merchants.campaignsPaused })
    .from(merchants)
    .where(eq(merchants.id, data.merchantId))
    .limit(1);

  if (merchantPauseRow[0]?.campaignsPaused) {
    console.log(
      `[CampaignWorker] Campaigns paused for merchant ${data.merchantId} — skipping schedule`
    );
    return;
  }

  // ── 1a. 5-hour dedup window: same contact + same amount ────────────────
  // Catches gateway retries that generate a new failed_payment record
  // (different payment ID, same customer contact + same charge amount).
  // Matches on phone OR email, any run status — a recently-recovered charge
  // is still a duplicate within the window.
  const recentRun = await campaignQueries.getRecentRunForContact(db, {
    merchantId: data.merchantId,
    customerEmail: data.customerEmail,
    customerPhone: data.customerPhone,
    amountPaise: data.amountPaise,
    windowMs: 5 * 60 * 60 * 1000,
  });

  if (recentRun) {
    console.log(
      `[CampaignWorker] Dedup: run ${recentRun.id} (${recentRun.status}) already exists ` +
      `for same contact+amount within 5h — skipping payment ${data.failedPaymentId}`
    );
    return;
  }

  // ── 1b. Active-run check: same customer, different amount ───────────────
  // If the customer has an ACTIVE run for a different amount (different subscription
  // or billing period), cancel the old one and start fresh.
  const existingRun = await campaignQueries.getActiveRunForCustomer(db, data.customerId);

  if (existingRun && existingRun.payment.amountPaise !== data.amountPaise) {
    console.log(
      `[CampaignWorker] Customer ${data.customerId} has active run for amount ${existingRun.payment.amountPaise}, ` +
      `new failure is ${data.amountPaise} — cancelling old run and starting new campaign`
    );

    await campaignQueue.add('cancel_campaign_run', {
      type: 'cancel_campaign_run',
      campaignRunId: existingRun.run.id,
      failedPaymentId: existingRun.run.failedPaymentId,
      merchantId: data.merchantId,
      customerId: data.customerId,
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone,
      customerName: data.customerName,
      amountPaise: existingRun.payment.amountPaise,
      currency: data.currency,
      merchantFromEmail: '',
      merchantFromName: '',
      merchantCompanyName: '',
    } satisfies CancelCampaignRunJobData, { priority: 1 });
  }

  // ── 2. Pick campaign template ───────────────────────────────────────────
  const template = await campaignQueries.pickCampaignTemplate(
    db,
    data.merchantId,
    data.planRequired,
    data.declineCategory
  );

  if (!template) {
    console.error(
      `[CampaignWorker] No campaign template found for merchant ${data.merchantId} ` +
      `plan=${data.planRequired} decline=${data.declineCategory}`
    );
    return;
  }

  // ── 3. Determine active channels ────────────────────────────────────────
  const channelsActive = resolveChannels({
    hasEmail: !!data.customerEmail && data.emailValid,
    hasPhone: !!data.customerPhone,
    hasWhatsapp: data.hasWhatsapp ?? false,
  });

  if (channelsActive.length === 0) {
    console.warn(
      `[CampaignWorker] No valid contact channels for customer ${data.customerId} — skipping campaign`
    );
    return;
  }

  // ── 4. Get template steps ───────────────────────────────────────────────
  const steps = await campaignQueries.getCampaignSteps(db, template.id);
  if (steps.length === 0) {
    console.error(`[CampaignWorker] Template ${template.id} has no steps — skipping`);
    return;
  }

  // ── 5. Load merchant branding (needed in each step's job payload) ───────
  const brandRows = await db
    .select()
    .from(merchantBrandSettings)
    .where(eq(merchantBrandSettings.merchantId, data.merchantId))
    .limit(1);
  const brand = brandRows[0];

  const merchantRows = await db
    .select({ companyName: merchants.companyName, websiteUrl: merchants.websiteUrl })
    .from(merchants)
    .where(eq(merchants.id, data.merchantId))
    .limit(1);
  const merchant = merchantRows[0];

  const merchantFromName = brand?.fromName ?? merchant?.companyName ?? 'Payment Recovery';
  const merchantFromEmail = brand?.fromEmail ?? 'recovery@fynback.com';
  const merchantReplyTo = brand?.replyToEmail ?? merchantFromEmail;
  const merchantBrandColor = brand?.brandColorHex ?? '#3b82f6';
  const merchantCompanyName = merchant?.companyName ?? 'Our service';
  const merchantCheckoutUrl = merchant?.websiteUrl ?? '#';
  const merchantLogoUrl = brand?.logoUrl ?? undefined;
  const merchantCompanyTagline = brand?.companyTagline ?? undefined;

  // ── 6. Create campaign run ──────────────────────────────────────────────
  const run = await campaignQueries.createCampaignRun(db, {
    merchantId: data.merchantId,
    failedPaymentId: data.failedPaymentId,
    campaignTemplateId: template.id,
    customerId: data.customerId,
    channelsActive,
    totalSteps: steps.length,
  });

  if (!run) {
    // ON CONFLICT DO NOTHING — run already exists (idempotent duplicate)
    console.log(`[CampaignWorker] Campaign run for payment ${data.failedPaymentId} already exists`);
    return;
  }

  console.log(`[CampaignWorker] Created campaign run ${run.id} with ${steps.length} steps`);

  // Update failed_payment with the active campaign run id
  await db
    .update((await import('@fynback/db')).failedPayments)
    .set({ activeCampaignRunId: run.id, updatedAt: new Date() })
    .where(eq((await import('@fynback/db')).failedPayments.id, data.failedPaymentId));

  // ── 7. Schedule all steps as delayed BullMQ jobs ────────────────────────
  const runStepInserts: Parameters<typeof campaignQueries.createCampaignRunSteps>[1] = [];
  const now = Date.now();

  for (const step of steps) {
    const delayMs = step.dayOffset * 24 * 60 * 60 * 1000;
    const scheduledAt = new Date(now + delayMs);

    // Determine which channels to send on for this step.
    // step.channels is the merchant-configured list (e.g. ['email', 'whatsapp']).
    // Intersect with channelsActive (what this customer actually has available).
    const stepChannels = (
      (step.channels as string[] | null)?.length ? (step.channels as string[]) : [step.preferredChannel]
    ).filter((ch) => channelsActive.includes(ch as 'email' | 'whatsapp' | 'sms')) as ('email' | 'whatsapp' | 'sms')[];

    // If no channels survived the intersection, fall back to the active channel for this user (best-effort)
    const activeStepChannels = stepChannels.length > 0
      ? stepChannels
      : (channelsActive.length > 0 ? [channelsActive[0]] : ['email'] as ('email' | 'whatsapp' | 'sms')[]);

    // Pre-load all message templates for this step (one DB call, reuse for each channel)
    const messages = await campaignQueries.getMessageTemplatesForStep(db, step.id);

    // Create one BullMQ job per channel — same delay, independent retries
    for (const channel of activeStepChannels) {
      const msgTemplate = messages.find((m) => m.channel === channel)
        ?? messages.find((m) => m.channel === 'email')  // fallback content
        ?? messages[0];

      const bullJob = await campaignQueue.add(
        'execute_campaign_step',
        {
          type: 'execute_campaign_step',
          campaignRunId: run.id,
          campaignRunStepId: '',   // filled in after DB insert below
          campaignStepId: step.id,
          messageTemplateId: msgTemplate?.id ?? '',
          failedPaymentId: data.failedPaymentId,
          merchantId: data.merchantId,
          customerId: data.customerId,
          stepNumber: step.stepNumber,
          totalSteps: steps.length,
          isPauseOffer: step.isPauseOffer,
          isFinalStep: step.stepNumber === steps.length,
          channel,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone,
          customerName: data.customerName,
          amountPaise: data.amountPaise,
          currency: data.currency,
          merchantFromName,
          merchantFromEmail,
          merchantReplyTo,
          merchantBrandColor,
          merchantCompanyName,
          merchantCheckoutUrl,
          merchantLogoUrl,
          merchantCompanyTagline,
        } satisfies ExecuteCampaignStepJobData,
        { delay: delayMs, priority: 2 }
      );

      runStepInserts.push({
        campaignRunId: run.id,
        campaignStepId: step.id,
        messageTemplateId: msgTemplate?.id,
        stepNumber: step.stepNumber,
        channelUsed: channel,
        scheduledAt,
        bullmqJobId: bullJob.id ?? undefined,
      });
    }
  }

  // ── 8. Persist run steps to DB ─────────────────────────────────────────
  const createdSteps = await campaignQueries.createCampaignRunSteps(db, runStepInserts);

  // Back-fill campaignRunStepId into each BullMQ job's data
  // (We need the run step ID in the job so the worker can update it on completion)
  for (let i = 0; i < createdSteps.length; i++) {
    const step = createdSteps[i];
    const bullJob = await campaignQueue.getJob(step.bullmqJobId!);
    if (bullJob) {
      await bullJob.updateData({
        ...bullJob.data,
        campaignRunStepId: step.id,
      } as any);
    }
  }

  console.log(
    `[CampaignWorker] Scheduled ${createdSteps.length} steps for run ${run.id}. ` +
    `Channels: ${channelsActive.join(', ')}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler 3: Execute a campaign step (send the message)
// ─────────────────────────────────────────────────────────────────────────────

async function handleExecuteStep(
  job: Job<ExecuteCampaignStepJobData>
): Promise<void> {
  const data = job.data;
  console.log(
    `[CampaignWorker] Executing step ${data.stepNumber}/${data.totalSteps} ` +
    `for run ${data.campaignRunId} via ${data.channel}`
  );

  // ── Guard: skip if run is no longer active ──────────────────────────────
  const run = await campaignQueries.getActiveCampaignRun(db, data.failedPaymentId);
  if (!run || run.id !== data.campaignRunId) {
    console.log(
      `[CampaignWorker] Run ${data.campaignRunId} is no longer active — skipping step ${data.stepNumber}`
    );
    return;
  }

  // ── Load message template ───────────────────────────────────────────────
  const { messageTemplates: msgTbl } = await import('@fynback/db');
  const msgRows = await db
    .select()
    .from(msgTbl)
    .where(eq(msgTbl.id, data.messageTemplateId))
    .limit(1);
  const msgTemplate = msgRows[0];

  if (!msgTemplate) {
    console.error(`[CampaignWorker] Message template ${data.messageTemplateId} not found`);
    return;
  }

  // ── Substitute template variables ──────────────────────────────────────
  const vars: Record<string, string> = {
    customer_name: data.customerName?.split(' ')[0] ?? 'there',
    amount: formatAmount(data.amountPaise, data.currency),
    merchant_name: data.merchantCompanyName,
    payment_link: data.merchantCheckoutUrl,
    product_name: data.merchantCompanyName,
    brand_color: data.merchantBrandColor,
    value_hook: data.merchantCompanyTagline ?? '',
  };

  const bodyText = substitute(msgTemplate.bodyText ?? '', vars);
  const subject = substitute(msgTemplate.subject ?? '', vars);

  // Build fully branded HTML email — always use merchant branding shell.
  // If the message_template already stores custom bodyHtml, use it inside the shell;
  // otherwise render the plain bodyText as the email body.
  const rawBodyHtml = msgTemplate.bodyHtml ? substitute(msgTemplate.bodyHtml, vars) : null;
  const bodyHtml = buildMerchantDunningEmail({
    companyName: data.merchantCompanyName,
    logoUrl: data.merchantLogoUrl,
    brandColor: data.merchantBrandColor,
    companyTagline: data.merchantCompanyTagline,
    customerName: vars.customer_name,
    bodyHtmlContent: rawBodyHtml,
    bodyText,
    paymentLink: data.merchantCheckoutUrl,
    amount: vars.amount,
  });

  // ── Load merchant WhatsApp/SMS settings from DB ───────────────────────────
  // We load this lazily (only when needed) to avoid unnecessary DB queries
  // for email-only campaigns. The brand settings were already loaded at schedule
  // time but the encrypted API keys are intentionally NOT embedded in job payloads.
  let interaktApiKey: string | undefined;
  let smsSenderId: string | undefined;
  let smsEnabled = false;
  let whatsappEnabled = false;
  let whatsappTemplatesApproved = false;

  if (data.channel === 'whatsapp' || data.channel === 'sms' || effectiveChannel === 'whatsapp' || effectiveChannel === 'sms') {
    const brandRow = await db
      .select({
        whatsappEnabled: merchantBrandSettings.whatsappEnabled,
        whatsappTemplatesApproved: merchantBrandSettings.whatsappTemplatesApproved,
        interaktApiKeyEncrypted: merchantBrandSettings.interaktApiKeyEncrypted,
        smsEnabled: merchantBrandSettings.smsEnabled,
        msg91ApiKeyEncrypted: merchantBrandSettings.msg91ApiKeyEncrypted,
        msg91SenderId: merchantBrandSettings.msg91SenderId,
      })
      .from(merchantBrandSettings)
      .where(eq(merchantBrandSettings.merchantId, data.merchantId))
      .limit(1);

    const brand = brandRow[0];
    if (brand) {
      whatsappEnabled = brand.whatsappEnabled;
      whatsappTemplatesApproved = brand.whatsappTemplatesApproved;
      smsEnabled = brand.smsEnabled;
      smsSenderId = brand.msg91SenderId ?? undefined;

      if (brand.interaktApiKeyEncrypted) {
        try {
          const decrypted = decrypt(brand.interaktApiKeyEncrypted).trim();
          if (decrypted) {
            interaktApiKey = decrypted;
          } else {
            console.error(
              `[CampaignWorker] Interakt API key for merchant ${data.merchantId} decrypted to empty string — ` +
              `check ENCRYPTION_SECRET matches the value used at onboarding`
            );
          }
        } catch (err) {
          console.error(
            `[CampaignWorker] Failed to decrypt Interakt API key for merchant ${data.merchantId}: ${err} — ` +
            `ENCRYPTION_SECRET in worker env likely differs from the one used when the key was saved`
          );
        }
      }
    }
  }

  // ── Send via the appropriate channel ───────────────────────────────────
  let providerMessageId: string | undefined;
  // effectiveChannel re-routes email→whatsapp when email is a gateway placeholder
  // (handles jobs that were scheduled before the validate step learned to detect void emails)
  let effectiveChannel: 'email' | 'whatsapp' | 'sms' = data.channel;
  if (data.channel === 'email' && isPlaceholderEmail(data.customerEmail ?? null)) {
    if (data.customerPhone) {
      effectiveChannel = 'whatsapp'; // WhatsApp block will fall back to SMS if needed
      console.log(
        `[CampaignWorker] Rerouting step ${data.stepNumber} from email (placeholder) → whatsapp/sms for phone ${data.customerPhone}`
      );
    } else {
      // No phone either — skip the step
      console.warn(`[CampaignWorker] Placeholder email and no phone — marking step ${data.stepNumber} skipped`);
      if (data.campaignRunStepId) {
        await campaignQueries.updateRunStepStatus(db, data.campaignRunStepId, 'skipped');
      }
      return;
    }
  }
  // sentChannel may differ from effectiveChannel when WhatsApp falls back to SMS
  let sentChannel: 'email' | 'whatsapp' | 'sms' = effectiveChannel;

  try {
    if (effectiveChannel === 'email' && data.customerEmail) {
      const result = await resend.emails.send({
        from: `${data.merchantFromName} <${data.merchantFromEmail}>`,
        to: data.customerEmail,
        replyTo: data.merchantReplyTo,
        subject,
        html: bodyHtml,
        text: bodyText,
        tags: [
          { name: 'type', value: 'campaign_dunning' },
          { name: 'step', value: String(data.stepNumber) },
          { name: 'merchant_id', value: data.merchantId },
          { name: 'campaign_run_id', value: data.campaignRunId },
        ],
      });
      providerMessageId = result.data?.id;

    } else if (effectiveChannel === 'whatsapp' && data.customerPhone) {
      const whatsappReady = whatsappEnabled && whatsappTemplatesApproved && !!interaktApiKey;

      if (whatsappReady) {
        try {
          providerMessageId = await sendDunningWhatsApp({
            apiKey: interaktApiKey!,
            phone: data.customerPhone,
            customerName: data.customerName,
            customerEmail: data.customerEmail,
            amountFormatted: formatAmount(data.amountPaise, data.currency),
            merchantName: data.merchantCompanyName,
            paymentLink: data.merchantCheckoutUrl,
            stepNumber: data.stepNumber,
            campaignRunId: data.campaignRunId,
          });
        } catch (waErr) {
          // WhatsApp API call failed — try SMS fallback before giving up
          console.warn(`[CampaignWorker] WhatsApp send failed: ${waErr} — trying SMS fallback`);
          providerMessageId = undefined; // will trigger SMS fallback below
        }
      } else {
        console.warn(
          `[CampaignWorker] WhatsApp not ready for merchant ${data.merchantId} ` +
          `(enabled=${whatsappEnabled} approved=${whatsappTemplatesApproved} hasKey=${!!interaktApiKey}) — trying SMS fallback`
        );
      }

      // SMS fallback: used when WhatsApp is unavailable or the API call failed
      if (!providerMessageId && smsEnabled && data.customerPhone) {
        console.log(`[CampaignWorker] Falling back to SMS for step ${data.stepNumber}`);
        providerMessageId = await sendSms(data.customerPhone, bodyText, data.merchantId);
        sentChannel = 'sms';
      }

      // If still no send and no SMS either, mark step skipped
      if (!providerMessageId && !smsEnabled) {
        console.warn(
          `[CampaignWorker] WhatsApp unavailable and SMS disabled for merchant ${data.merchantId} — marking step skipped`
        );
        if (data.campaignRunStepId) {
          await campaignQueries.updateRunStepStatus(db, data.campaignRunStepId, 'skipped');
        }
        return;
      }

    } else if (effectiveChannel === 'sms' && data.customerPhone) {
      providerMessageId = await sendSms(data.customerPhone, bodyText, data.merchantId);

    } else {
      console.warn(
        `[CampaignWorker] Channel ${effectiveChannel} has no valid contact info — marking step skipped`
      );
      if (data.campaignRunStepId) {
        await campaignQueries.updateRunStepStatus(db, data.campaignRunStepId, 'skipped');
      }
      return;
    }
  } catch (err) {
    console.error(`[CampaignWorker] Send failed for step ${data.stepNumber}: ${err}`);
    throw err; // BullMQ will retry
  }

  // ── Record outreach event ───────────────────────────────────────────────
  // Use sentChannel (may be 'sms' when WhatsApp fell back to SMS)
  const outreachEvent = await paymentQueries.insertOutreachEvent(db, {
    failedPaymentId: data.failedPaymentId,
    merchantId: data.merchantId,
    channel: sentChannel,
    recipientEmail: sentChannel === 'email' ? data.customerEmail : undefined,
    recipientPhone: sentChannel !== 'email' ? data.customerPhone : undefined,
    templateId: data.messageTemplateId,
    stepNumber: data.stepNumber,
  });

  if (outreachEvent?.id && providerMessageId) {
    await paymentQueries.updateOutreachStatus(db, outreachEvent.id, {
      status: 'sent',
      providerMessageId,
      sentAt: new Date(),
    });
  }

  // ── Update run step ─────────────────────────────────────────────────────
  if (data.campaignRunStepId && outreachEvent?.id) {
    await campaignQueries.markRunStepSent(db, data.campaignRunStepId, outreachEvent.id);
  }

  // ── Update run progress ────────────────────────────────────────────────
  const runUpdates: Parameters<typeof campaignQueries.updateCampaignRun>[2] = {
    currentStep: data.stepNumber,
  };

  if (data.isPauseOffer) {
    runUpdates.pauseOfferSent = true;
    runUpdates.pauseOfferStatus = 'pending';
    // Notify merchant about the pause offer
    await notifyMerchantPauseOffer(data);
  }

  if (data.isFinalStep) {
    runUpdates.status = 'exhausted';
    runUpdates.completedAt = new Date();
    // Notify merchant the sequence is exhausted
    await notifyMerchantExhausted(data);
    // Assign chat to merchant's agent in Interakt so they can do personal outreach
    if (data.channel === 'whatsapp' && data.customerPhone && interaktApiKey) {
      await assignInteraktChat(interaktApiKey, {
        customerPhone: data.customerPhone,
        agentEmail: data.merchantFromEmail, // merchant's email = their Interakt agent login
      });
    }
  }

  await campaignQueries.updateCampaignRun(db, data.campaignRunId, runUpdates);

  console.log(
    `[CampaignWorker] Step ${data.stepNumber} sent via ${data.channel} ` +
    `for run ${data.campaignRunId}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler 4: Cancel campaign run (on payment recovery)
// ─────────────────────────────────────────────────────────────────────────────

async function handleCancelRun(
  job: Job<CancelCampaignRunJobData>
): Promise<void> {
  const data = job.data;
  console.log(`[CampaignWorker] Cancelling run ${data.campaignRunId} (payment recovered)`);

  // ── 1. Cancel pending BullMQ jobs ──────────────────────────────────────
  const scheduledSteps = await campaignQueries.getScheduledRunSteps(db, data.campaignRunId);

  for (const step of scheduledSteps) {
    if (step.bullmqJobId) {
      try {
        const bullJob = await campaignQueue.getJob(step.bullmqJobId);
        if (bullJob) await bullJob.remove();
      } catch (err) {
        // Job may have already fired or been removed — not fatal
        console.warn(`[CampaignWorker] Could not remove BullMQ job ${step.bullmqJobId}: ${err}`);
      }
    }
  }

  // ── 2. Mark all scheduled steps cancelled in DB ─────────────────────────
  await campaignQueries.cancelAllScheduledRunSteps(db, data.campaignRunId);

  // ── 3. Mark run as recovered ────────────────────────────────────────────
  await campaignQueries.updateCampaignRun(db, data.campaignRunId, {
    status: 'recovered',
    completedAt: new Date(),
  });

  // ── 4. Send recovery confirmation to customer ───────────────────────────
  // Brand settings may be passed in the job, or (when called from retry success)
  // they'll be empty strings — load from DB in that case.
  let fromEmail = data.merchantFromEmail;
  let fromName = data.merchantFromName;
  let companyName = data.merchantCompanyName;

  if (!fromEmail) {
    const [brandRows, merchantRows] = await Promise.all([
      db.select({ fromEmail: merchantBrandSettings.fromEmail, fromName: merchantBrandSettings.fromName })
        .from(merchantBrandSettings).where(eq(merchantBrandSettings.merchantId, data.merchantId)).limit(1),
      db.select({ companyName: merchants.companyName })
        .from(merchants).where(eq(merchants.id, data.merchantId)).limit(1),
    ]);
    fromEmail = brandRows[0]?.fromEmail ?? 'recovery@fynback.com';
    fromName = brandRows[0]?.fromName ?? 'Payment Recovery';
    companyName = merchantRows[0]?.companyName ?? 'Our service';
  }

  const amount = formatAmount(data.amountPaise, data.currency);

  if (fromEmail && data.customerEmail) {
    await resend.emails.send({
      from: `${fromName || 'Our Team'} <${fromEmail}>`,
      to: data.customerEmail,
      subject: `You're all caught up! Payment received — ${companyName}`,
      html: buildRecoveryConfirmationEmail({ ...data, merchantFromName: fromName, merchantFromEmail: fromEmail, merchantCompanyName: companyName }, amount),
      text: `Hi ${data.customerName ?? 'there'},\n\nGreat news! Your payment of ${amount} has been received. Your ${companyName} subscription is fully active.\n\nThank you!\n\n— ${companyName} Team`,
    });
  }

  // Also send WhatsApp recovery confirmation (best-effort — non-blocking)
  if (data.customerPhone) {
    // Load and decrypt Interakt API key from DB
    let interaktApiKey: string | undefined;
    try {
      const brandRow = await db
        .select({
          whatsappEnabled: merchantBrandSettings.whatsappEnabled,
          interaktApiKeyEncrypted: merchantBrandSettings.interaktApiKeyEncrypted,
        })
        .from(merchantBrandSettings)
        .where(eq(merchantBrandSettings.merchantId, data.merchantId))
        .limit(1);

      const brand = brandRow[0];
      if (brand?.whatsappEnabled && brand.interaktApiKeyEncrypted) {
        interaktApiKey = decrypt(brand.interaktApiKeyEncrypted);
      }
    } catch {
      // Non-fatal — email confirmation already sent above
    }

    if (interaktApiKey) {
      await sendRecoveryConfirmationWhatsApp({
        apiKey: interaktApiKey,
        phone: data.customerPhone,
        customerName: data.customerName,
        amountFormatted: amount,
        merchantName: companyName,
      });
    }
  }

  console.log(`[CampaignWorker] Run ${data.campaignRunId} cancelled, ${scheduledSteps.length} steps removed`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler 5: Payday notification
// ─────────────────────────────────────────────────────────────────────────────

async function handlePaydayNotify(
  job: Job<PaydayNotifyJobData>
): Promise<void> {
  const data = job.data;

  if (!data.exhaustedRuns || data.exhaustedRuns.length === 0) return;

  console.log(
    `[CampaignWorker] Sending payday notifications for ${data.exhaustedRuns.length} runs ` +
    `(merchant ${data.merchantId})`
  );

  // Mark all these runs as having received the payday notification
  for (const run of data.exhaustedRuns) {
    await campaignQueries.updateCampaignRun(db, run.campaignRunId, {
      paydayNotificationSent: true,
    });
  }

  // The actual dashboard notification is handled by the API layer.
  // The worker just marks them as notified so they don't fire again next payday.
  // The dashboard polls GET /api/campaigns/payday-alerts to show the notifications.
  console.log(`[CampaignWorker] Payday notification marked for ${data.exhaustedRuns.length} runs`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel resolution helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determines which channels to activate for a campaign run.
 *
 * Rules (from spec):
 *   email + phone → ['email', 'whatsapp'] or ['email', 'sms']
 *   email only    → ['email']
 *   phone only    → ['whatsapp'] or ['sms']
 *   neither       → [] (campaign will not be created)
 */
function resolveChannels(opts: {
  hasEmail: boolean;
  hasPhone: boolean;
  hasWhatsapp: boolean;
}): ('email' | 'whatsapp' | 'sms')[] {
  const channels: ('email' | 'whatsapp' | 'sms')[] = [];

  if (opts.hasEmail) {
    channels.push('email');
  }

  if (opts.hasPhone) {
    channels.push(opts.hasWhatsapp ? 'whatsapp' : 'sms');
  }

  return channels;
}

/**
 * Picks the actual channel to use for a specific step,
 * falling back within the active channels list.
 */
function resolveStepChannel(
  preferred: 'email' | 'whatsapp' | 'sms',
  active: string[]
): 'email' | 'whatsapp' | 'sms' {
  if (active.includes(preferred)) return preferred;
  // Fallback order: email → whatsapp → sms
  if (active.includes('email')) return 'email';
  if (active.includes('whatsapp')) return 'whatsapp';
  return 'sms';
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel send helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true for known gateway-generated placeholder emails that have no real inbox.
 * Razorpay uses void@razorpay.com, Cashfree uses void@cashfree.com, etc.
 * These must be blocked before MX check — the domains have valid MX records
 * but the mailboxes don't exist, causing bounces that hurt sender reputation.
 */
function isPlaceholderEmail(email: string): boolean {
  const lower = email.toLowerCase().trim();
  // Block any void@* pattern (used by Razorpay, Cashfree, and others)
  if (lower.startsWith('void@')) return true;
  // Block other known gateway no-reply addresses used as billing placeholders
  const blocked = [
    'noreply@razorpay.com',
    'no-reply@razorpay.com',
    'billing@razorpay.com',
    'noreply@cashfree.com',
    'no-reply@cashfree.com',
  ];
  return blocked.includes(lower);
}

/**
 * MX / DNS validation for an email address.
 * We check if the domain has valid MX records — this catches most fake/dead addresses.
 * We do NOT send a probe email (avoids spam complaints).
 */
async function checkEmailMx(email: string): Promise<boolean> {
  try {
    const domain = email.split('@')[1];
    if (!domain) return false;

    const dns = await import('dns/promises');
    const records = await dns.resolveMx(domain);
    return records.length > 0;
  } catch {
    // ENODATA, ENOTFOUND, etc. — domain has no MX records
    return false;
  }
}

/**
 * Checks if a phone number is a known WhatsApp user via the Interakt user lookup API.
 *
 * Uses the merchant's own Interakt API key — no separate Meta credentials needed.
 * Endpoint: GET /v1/public/apis/users/phone_number/{phone_without_country_code}
 *
 * Return values:
 *   true  — user found in Interakt with channel_type = "Whatsapp"
 *   false — user found but on a different channel (not WhatsApp)
 *   null  — user not found OR API unavailable → caller defaults to optimistic true
 *
 * WHY null instead of false when not found:
 * A customer who has never interacted with the merchant's Interakt account won't
 * appear in the lookup even if they have WhatsApp. Treating "not found" as false
 * would silently skip WhatsApp for most new customers.
 */
async function checkWhatsAppAvailability(
  phone: string,
  interaktApiKey?: string
): Promise<boolean | null> {
  if (!interaktApiKey) {
    // No API key available — can't check, caller uses optimistic default
    return null;
  }

  // Interakt requires phone without country code — strip leading +91 / 91
  const digits = phone.replace(/\D/g, '');
  const phoneWithoutCC = digits.startsWith('91') && digits.length > 10
    ? digits.slice(2)
    : digits;

  try {
    const res = await fetch(
      `https://api.interakt.ai/v1/public/apis/users/phone_number/${phoneWithoutCC}`,
      {
        headers: {
          Authorization: `Basic ${interaktApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (res.status === 404) {
      // User genuinely not in Interakt yet — unknown, not "no WhatsApp"
      return null;
    }

    if (!res.ok) {
      console.warn(`[CampaignWorker] Interakt user lookup ${res.status} for ${phoneWithoutCC}`);
      return null;
    }

    const json = await res.json() as {
      result?: boolean;
      data?: { customers?: Array<{ channel_type?: string }> };
    };

    const customers = json.data?.customers ?? [];
    if (customers.length === 0) return null; // not found → unknown

    // If any record has channel_type Whatsapp → confirmed WhatsApp user
    const hasWA = customers.some(
      (c) => c.channel_type?.toLowerCase() === 'whatsapp'
    );
    return hasWA ? true : false;
  } catch (err) {
    console.warn(`[CampaignWorker] Interakt WhatsApp check failed for ${phoneWithoutCC}: ${err}`);
    return null;
  }
}

// WhatsApp send is handled by src/lib/interakt.ts (sendDunningWhatsApp)

/**
 * Sends an SMS via MSG91 API.
 * Returns the MSG91 request ID for delivery tracking.
 */
async function sendSms(
  phone: string,
  body: string,
  merchantId: string
): Promise<string | undefined> {
  const apiKey = process.env.MSG91_API_KEY;
  const senderId = process.env.MSG91_SENDER_ID ?? 'FYNBAK';

  if (!apiKey) {
    console.warn('[CampaignWorker] MSG91_API_KEY not set — skipping SMS send');
    return undefined;
  }

  const normalized = phone.replace(/\D/g, '');
  const to = normalized.startsWith('91') ? normalized : `91${normalized}`;

  const response = await fetch('https://api.msg91.com/api/v5/flow/', {
    method: 'POST',
    headers: {
      authkey: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: senderId,
      short_url: '0',
      mobiles: to,
      message: body,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`MSG91 SMS API error ${response.status}: ${err}`);
  }

  const json = await response.json() as { request_id?: string };
  return json.request_id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Merchant notification helpers
// ─────────────────────────────────────────────────────────────────────────────

async function notifyMerchantPauseOffer(data: ExecuteCampaignStepJobData): Promise<void> {
  if (!data.merchantFromEmail) return;

  const amount = formatAmount(data.amountPaise, data.currency);
  const customerDisplay = data.customerName ?? data.customerEmail ?? data.customerPhone ?? 'A customer';

  await resend.emails.send({
    from: `FynBack Alerts <alerts@fynback.com>`,
    to: data.merchantFromEmail,
    subject: `[Action may be needed] ${customerDisplay} received a pause offer — ${data.merchantCompanyName}`,
    html: buildMerchantPauseOfferEmail(data, amount, customerDisplay),
    text:
      `Hi,\n\n` +
      `${customerDisplay} has received a pause subscription offer for their failed payment of ${amount}.\n\n` +
      `If they request a pause, you'll receive a separate notification to approve or reject.\n\n` +
      `View in dashboard: ${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.fynback.com'}/dashboard/campaigns\n\n` +
      `— FynBack`,
  });
}

async function notifyMerchantExhausted(data: ExecuteCampaignStepJobData): Promise<void> {
  if (!data.merchantFromEmail) return;

  const amount = formatAmount(data.amountPaise, data.currency);
  const customerDisplay = data.customerName ?? data.customerEmail ?? data.customerPhone ?? 'A customer';

  await resend.emails.send({
    from: `FynBack Alerts <alerts@fynback.com>`,
    to: data.merchantFromEmail,
    subject: `[Attention needed] ${customerDisplay} is at the edge of cancellation — ${data.merchantCompanyName}`,
    html: buildMerchantExhaustedEmail(data, amount, customerDisplay),
    text:
      `Hi,\n\n` +
      `The recovery campaign for ${customerDisplay} (${amount}) has been exhausted.\n\n` +
      `Their subscription will be cancelled unless you take action.\n\n` +
      `You can cancel or pause their subscription from your dashboard:\n` +
      `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.fynback.com'}/dashboard/campaigns\n\n` +
      `— FynBack`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatAmount(amountPaise: number, currency: string): string {
  if (currency === 'INR') return formatINR(amountPaise);
  return `${currency} ${(amountPaise / 100).toFixed(2)}`;
}

function substitute(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Email HTML builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a fully branded dunning email for the customer.
 *
 * WHY A SHARED BUILDER:
 * Each merchant has a different logo, brand color, and value hook (companyTagline).
 * The message_templates table stores the copywriting (subject + bodyText), but the
 * visual shell — logo, CTA button color, value hook block, footer — must be assembled
 * at send time using the merchant's brand settings fetched during campaign scheduling.
 *
 * STRUCTURE:
 *   ┌──────────────────────────────────────┐
 *   │  [Logo or Company Name]  brand color  │  ← brand header
 *   ├──────────────────────────────────────┤
 *   │  Hi {customer_name},                 │
 *   │  ┌─────────────────────────────────┐ │
 *   │  │ 💡 {companyTagline / value hook}│ │  ← accent block (if set)
 *   │  └─────────────────────────────────┘ │
 *   │  {email body text}                   │
 *   │  [Complete your payment →]           │  ← brand-colored CTA
 *   ├──────────────────────────────────────┤
 *   │  {companyName} · {amount} reminder   │  ← footer
 *   └──────────────────────────────────────┘
 */
function buildMerchantDunningEmail(params: {
  companyName: string;
  logoUrl?: string;
  brandColor: string;
  companyTagline?: string;
  customerName: string;
  bodyHtmlContent: string | null; // pre-substituted custom HTML, if any
  bodyText: string;               // pre-substituted plain text (always available)
  paymentLink: string;
  amount: string;
}): string {
  const color = params.brandColor || '#3b82f6';

  // Header: logo image if available, otherwise company name as text
  const headerContent = params.logoUrl
    ? `<img src="${params.logoUrl}" alt="${params.companyName}" style="max-height:44px;max-width:200px;object-fit:contain;display:block;">`
    : `<span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">${params.companyName}</span>`;

  // Value hook accent block — only rendered when companyTagline is set
  const taglineBlock = params.companyTagline
    ? `<div style="border-left:4px solid ${color};background:#f8f9fa;padding:14px 18px;border-radius:0 8px 8px 0;margin:0 0 24px 0;">
        <p style="margin:0;font-size:14px;color:#374151;font-weight:600;line-height:1.5;">${params.companyTagline}</p>
       </div>`
    : '';

  // Body: prefer custom HTML if the merchant has set it, otherwise convert plain text to paragraphs
  const bodyContent = params.bodyHtmlContent
    ? params.bodyHtmlContent
    : params.bodyText
      .split('\n\n')
      .map(p =>
        `<p style="margin:0 0 16px 0;font-size:15px;color:#444444;line-height:1.7;">${p.replace(/\n/g, '<br>')}</p>`
      )
      .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Payment Update — ${params.companyName}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Brand header -->
        <tr>
          <td style="background:${color};padding:22px 32px;">
            ${headerContent}
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 32px 24px;">
            <p style="margin:0 0 20px 0;font-size:16px;color:#111827;line-height:1.5;">Hi ${params.customerName},</p>
            ${taglineBlock}
            ${bodyContent}
            <!-- CTA button -->
            <table cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
              <tr>
                <td style="border-radius:8px;background:${color};">
                  <a href="${params.paymentLink}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Complete your payment →</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6;">
              ${params.companyName} · Your payment of <strong>${params.amount}</strong> could not be processed.<br>
              If you believe this is an error, please contact our support team.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Merchant notification email builders ─────────────────────────────────────

function buildRecoveryConfirmationEmail(
  data: CancelCampaignRunJobData,
  amount: string
): string {
  const name = data.customerName?.split(' ')[0] ?? 'there';
  return `<!DOCTYPE html><html><body style="background:#08090c;font-family:-apple-system,sans-serif;margin:0;padding:40px 16px;">
<table width="560" align="center" style="max-width:560px;margin:0 auto;">
<tr><td>
  <div style="border-top:3px solid #00e878;padding-top:24px;margin-bottom:32px;">
    <p style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0;">${data.merchantCompanyName}</p>
  </div>
  <p style="color:#e0e0e0;font-size:16px;line-height:1.6;margin:0 0 16px 0;">Hi ${name},</p>
  <p style="color:#e0e0e0;font-size:16px;line-height:1.6;margin:0 0 24px 0;">
    Great news! Your payment of <strong style="color:#00e878;">${amount}</strong> has been received.<br>
    Your ${data.merchantCompanyName} subscription is fully active. Thank you!
  </p>
  <div style="border-top:1px solid #1a1a1a;padding-top:20px;margin-top:32px;">
    <p style="color:#555;font-size:12px;margin:0;">— ${data.merchantCompanyName} Team</p>
  </div>
</td></tr>
</table>
</body></html>`;
}

function buildMerchantPauseOfferEmail(
  data: ExecuteCampaignStepJobData,
  amount: string,
  customerDisplay: string
): string {
  const dashUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.fynback.com'}/dashboard/campaigns`;
  return `<!DOCTYPE html><html><body style="background:#08090c;font-family:-apple-system,sans-serif;margin:0;padding:40px 16px;">
<table width="560" align="center" style="max-width:560px;margin:0 auto;">
<tr><td>
  <div style="border-top:3px solid #f59e0b;padding-top:24px;margin-bottom:24px;">
    <p style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0;">FynBack Campaign Alert</p>
  </div>
  <p style="color:#e0e0e0;font-size:16px;line-height:1.6;margin:0 0 16px 0;"><strong>${customerDisplay}</strong> has received a pause subscription offer for their failed payment of <strong style="color:#f59e0b;">${amount}</strong>.</p>
  <p style="color:#aaa;font-size:14px;line-height:1.6;margin:0 0 24px 0;">If they choose to pause, you'll receive another notification to approve or reject. No action needed right now.</p>
  <a href="${dashUrl}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:14px;font-weight:600;">View in Dashboard →</a>
  <div style="border-top:1px solid #1a1a1a;padding-top:20px;margin-top:32px;">
    <p style="color:#555;font-size:12px;margin:0;">Powered by FynBack · <a href="${dashUrl}" style="color:#3b82f6;">Manage campaigns</a></p>
  </div>
</td></tr>
</table>
</body></html>`;
}

function buildMerchantExhaustedEmail(
  data: ExecuteCampaignStepJobData,
  amount: string,
  customerDisplay: string
): string {
  const dashUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.fynback.com'}/dashboard/campaigns`;
  return `<!DOCTYPE html><html><body style="background:#08090c;font-family:-apple-system,sans-serif;margin:0;padding:40px 16px;">
<table width="560" align="center" style="max-width:560px;margin:0 auto;">
<tr><td>
  <div style="border-top:3px solid #e4534a;padding-top:24px;margin-bottom:24px;">
    <p style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0;">FynBack — Action Needed</p>
  </div>
  <p style="color:#e4534a;font-size:16px;font-weight:600;line-height:1.6;margin:0 0 16px 0;">Recovery campaign exhausted — subscription at edge of cancellation</p>
  <p style="color:#e0e0e0;font-size:15px;line-height:1.6;margin:0 0 8px 0;">Customer: <strong>${customerDisplay}</strong></p>
  <p style="color:#e0e0e0;font-size:15px;line-height:1.6;margin:0 0 24px 0;">Amount: <strong style="color:#e4534a;">${amount}</strong></p>
  <p style="color:#aaa;font-size:14px;line-height:1.6;margin:0 0 24px 0;">All dunning steps have been sent without recovery. You can manually cancel or pause their subscription from your dashboard.</p>
  <a href="${dashUrl}" style="display:inline-block;background:#e4534a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:14px;font-weight:600;">Take Action in Dashboard →</a>
  <div style="border-top:1px solid #1a1a1a;padding-top:20px;margin-top:32px;">
    <p style="color:#555;font-size:12px;margin:0;">Powered by FynBack · <a href="${dashUrl}" style="color:#3b82f6;">Manage campaigns</a></p>
  </div>
</td></tr>
</table>
</body></html>`;
}
