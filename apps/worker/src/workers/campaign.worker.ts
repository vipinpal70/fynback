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

  // ── 2. Validate email (MX check) ────────────────────────────────────────
  let emailValid = true;
  if (data.customerEmail) {
    emailValid = await checkEmailMx(data.customerEmail);
    if (!emailValid) {
      await campaignQueries.markEmailInvalid(db, customer.id);
      console.log(`[CampaignWorker] Email ${data.customerEmail} failed MX check — marked invalid`);
    }
  }

  // ── 3. Check WhatsApp availability ─────────────────────────────────────
  let hasWhatsapp: boolean | null = null;
  if (data.customerPhone) {
    hasWhatsapp = await checkWhatsAppAvailability(data.customerPhone);
    await campaignQueries.saveWhatsappCheckResult(db, customer.id, hasWhatsapp ?? false);
    console.log(`[CampaignWorker] WhatsApp check for ${data.customerPhone}: ${hasWhatsapp}`);
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

  // ── 1. Concurrent-failure dedup check ──────────────────────────────────
  const existingRun = await campaignQueries.getActiveRunForCustomer(db, data.customerId);

  if (existingRun) {
    const existingAmount = existingRun.payment.amountPaise;
    const newAmount = data.amountPaise;

    if (existingAmount === newAmount) {
      // Same amount → this is likely the same subscription retrying (gateway duplicate).
      // Continue the existing campaign — do NOT start a new one.
      console.log(
        `[CampaignWorker] Customer ${data.customerId} already has an active run for ` +
        `same amount ${newAmount} — skipping new campaign`
      );
      return;
    }

    // Different amount → different subscription or billing period.
    // Cancel the old run and start a new one.
    console.log(
      `[CampaignWorker] Customer ${data.customerId} has active run for amount ${existingAmount}, ` +
      `new failure is ${newAmount} — cancelling old run and starting new campaign`
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
      amountPaise: existingAmount,
      currency: data.currency,
      merchantFromEmail: '',    // Not sending a recovery email here — just cancelling
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
    // Resolve channel for this step based on available channels
    const channel = resolveStepChannel(step.preferredChannel, channelsActive);

    // Find the message template for this step + channel
    const messages = await campaignQueries.getMessageTemplatesForStep(db, step.id);
    const msgTemplate = messages.find((m) => m.channel === channel)
      ?? messages.find((m) => m.channel === 'email')  // fallback to email
      ?? messages[0];

    const delayMs = step.dayOffset * 24 * 60 * 60 * 1000;
    const scheduledAt = new Date(now + delayMs);

    // Enqueue the delayed step job
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
      });
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
  };

  const bodyHtml = substitute(msgTemplate.bodyHtml ?? '', vars);
  const bodyText = substitute(msgTemplate.bodyText ?? '', vars);
  const subject = substitute(msgTemplate.subject ?? '', vars);

  // ── Send via the appropriate channel ───────────────────────────────────
  let providerMessageId: string | undefined;
  let sendError: string | undefined;

  try {
    if (data.channel === 'email' && data.customerEmail) {
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

    } else if (data.channel === 'whatsapp' && data.customerPhone) {
      providerMessageId = await sendWhatsApp(data.customerPhone, bodyText, data);

    } else if (data.channel === 'sms' && data.customerPhone) {
      providerMessageId = await sendSms(data.customerPhone, bodyText, data.merchantId);

    } else {
      console.warn(
        `[CampaignWorker] Channel ${data.channel} has no valid contact info — marking step skipped`
      );
      if (data.campaignRunStepId) {
        await campaignQueries.updateRunStepStatus(db, data.campaignRunStepId, 'skipped');
      }
      return;
    }
  } catch (err) {
    sendError = err instanceof Error ? err.message : String(err);
    console.error(`[CampaignWorker] Send failed for step ${data.stepNumber}: ${sendError}`);
    throw err; // BullMQ will retry
  }

  // ── Record outreach event ───────────────────────────────────────────────
  const outreachEvent = await paymentQueries.insertOutreachEvent(db, {
    failedPaymentId: data.failedPaymentId,
    merchantId: data.merchantId,
    channel: data.channel,
    recipientEmail: data.channel === 'email' ? data.customerEmail : undefined,
    recipientPhone: data.channel !== 'email' ? data.customerPhone : undefined,
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
  if (data.merchantFromEmail && data.customerEmail) {
    const amount = formatAmount(data.amountPaise, data.currency);
    await resend.emails.send({
      from: `${data.merchantFromName || 'Our Team'} <${data.merchantFromEmail}>`,
      to: data.customerEmail,
      subject: `You're all caught up! Payment received — ${data.merchantCompanyName}`,
      html: buildRecoveryConfirmationEmail(data, amount),
      text: `Hi ${data.customerName ?? 'there'},\n\nGreat news! Your payment of ${amount} has been received. Your ${data.merchantCompanyName} subscription is fully active.\n\nThank you!\n\n— ${data.merchantCompanyName} Team`,
    });
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

  if (opts.hasEmail) channels.push('email');

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
 * Checks if a phone number has an active WhatsApp account via Meta Business API.
 *
 * Uses the Cloud API phone number lookup endpoint.
 * Requires WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID env vars.
 *
 * Returns null if the API is unavailable (don't fail the whole campaign).
 */
async function checkWhatsAppAvailability(phone: string): Promise<boolean | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.warn('[CampaignWorker] WhatsApp API credentials not configured — skipping check');
    return null;
  }

  // Normalize phone number to E.164 format (remove spaces, dashes, leading zeros)
  const normalized = phone.replace(/\D/g, '');
  const e164 = normalized.startsWith('91') ? `+${normalized}` : `+91${normalized}`;

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/phone_numbers?phone=${encodeURIComponent(e164)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const body = await response.text();
      console.warn(`[CampaignWorker] WhatsApp API returned ${response.status}: ${body}`);
      return null;
    }

    const json = await response.json() as { data?: unknown[] };
    // If the phone number is registered on WhatsApp, the data array is non-empty
    return Array.isArray(json.data) && json.data.length > 0;
  } catch (err) {
    console.warn(`[CampaignWorker] WhatsApp check failed: ${err}`);
    return null;
  }
}

/**
 * Sends a WhatsApp message via Interakt API.
 * Returns the provider's message ID for delivery tracking.
 */
async function sendWhatsApp(
  phone: string,
  bodyText: string,
  data: ExecuteCampaignStepJobData
): Promise<string | undefined> {
  const apiKey = process.env.INTERAKT_API_KEY;
  if (!apiKey) {
    console.warn('[CampaignWorker] INTERAKT_API_KEY not set — skipping WhatsApp send');
    return undefined;
  }

  const normalized = phone.replace(/\D/g, '');
  const countryCode = normalized.startsWith('91') ? '91' : '91';
  const phoneNum = normalized.startsWith('91') ? normalized.slice(2) : normalized;

  const response = await fetch('https://api.interakt.ai/v1/public/message/', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(apiKey).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      countryCode,
      phoneNumber: phoneNum,
      callbackData: `campaign_run:${data.campaignRunId}:step:${data.stepNumber}`,
      type: 'Text',
      data: { message: bodyText },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Interakt WhatsApp API error ${response.status}: ${err}`);
  }

  const json = await response.json() as { id?: string };
  return json.id;
}

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
// Email HTML builders (merchant notifications)
// ─────────────────────────────────────────────────────────────────────────────

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
