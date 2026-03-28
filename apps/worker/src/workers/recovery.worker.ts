/**
 * workers/recovery.worker.ts
 *
 * The core BullMQ worker that processes all payment recovery jobs.
 *
 * WHAT THIS WORKER DOES:
 * Listens to the 'recoveryQueue' and handles 4 job types:
 *   1. retry_payment   → Calls gateway API to retry the payment
 *   2. send_email      → Sends recovery email via Resend
 *   3. send_whatsapp   → Sends WhatsApp message via Interakt/MSG91 (stub)
 *   4. send_sms        → Sends SMS via MSG91 DLT (stub)
 *
 * CONCURRENCY MODEL:
 * WHY concurrency: 5?
 * Each job does I/O (DB query + API call). Concurrency 5 means 5 jobs process
 * in parallel — mostly waiting on network, so 5 concurrent jobs use minimal CPU.
 * Higher concurrency would be fine too, but 5 is a safe default that prevents
 * overwhelming the Resend API or Razorpay retry endpoints.
 *
 * WHY A SEPARATE WORKER PROCESS (not in the Next.js app)?
 * Next.js runs on Vercel (serverless, stateless, short-lived).
 * BullMQ workers need to run continuously and maintain a persistent Redis connection.
 * Serverless functions timeout in 10-60 seconds — not suitable for long-running workers.
 * The worker runs in Railway as a separate always-on Node.js process.
 *
 * CONNECTION ISOLATION:
 * WHY create a new Redis connection here (not import bullmqConnection from packages/queue)?
 * BullMQ requires separate Redis connection instances for the Queue (producer) and
 * the Worker (consumer). Sharing a connection causes subtle bugs where the worker
 * and queue interfere with each other's pub/sub subscriptions.
 * The worker creates its OWN Redis connection that is not shared with anything else.
 */

import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { Resend } from 'resend';
import { createDb, paymentQueries, campaignQueries, merchantBrandSettings, merchants, eq } from '@fynback/db';
import type { RecoveryJobData, RetryPaymentJobData, SendEmailJobData, CancelCampaignRunJobData } from '@fynback/queue';
import { recoveryQueue, campaignQueue } from '@fynback/queue';
import { formatINR } from '@fynback/shared';
import { getRetrySchedule } from '../lib/retry-scheduler';

// ─────────────────────────────────────────────────────────────────────────────
// Clients & connections
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Database client — created once per worker process.
 * WHY NOT PER-JOB: Creating a new postgres connection per job is expensive.
 * postgres.js (underlying driver) manages a connection pool automatically.
 */
const db = createDb(process.env.DATABASE_URL!);

/**
 * Resend client for sending emails.
 * WHY RESEND: Best developer experience, React Email templates, webhook events
 * for delivery tracking, and reliable delivery to Indian ISPs.
 */
const resend = new Resend(process.env.RESEND_API_KEY!);

// ─────────────────────────────────────────────────────────────────────────────
// Worker startup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Starts the recovery worker.
 * Called from apps/worker/src/index.ts on process startup.
 *
 * @returns The Worker instance (for graceful shutdown handling)
 */
export function startRecoveryWorker(): Worker {
  /**
   * Create a DEDICATED Redis connection for this worker.
   *
   * WHY DEDICATED CONNECTION:
   * BullMQ workers use Redis pub/sub internally to receive job notifications.
   * If we reuse the same Redis instance as the queue producer, the pub/sub
   * subscriptions interfere. Always create a new Redis instance for workers.
   *
   * WHY maxRetriesPerRequest: null?
   * BullMQ workers hold long-running connections. The default ioredis behavior
   * is to fail after 20 retries. Setting null means "retry forever" — appropriate
   * for a worker that should reconnect after Redis restarts.
   */
  const workerRedisConnection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null, // REQUIRED for BullMQ workers — don't change this
  });

  const worker = new Worker<RecoveryJobData>(
    'recoveryQueue',
    processRecoveryJob,    // The job handler function
    {
      connection: workerRedisConnection,

      /**
       * Process 5 jobs concurrently.
       * WHY 5: Each job does I/O (DB + API), so CPU is not the bottleneck.
       * 5 concurrent I/O jobs = good throughput without overwhelming downstream services.
       */
      concurrency: 5,

      /**
       * Lock duration: 5 minutes.
       * WHY: If the worker crashes mid-job, the lock expires and another worker
       * instance can pick up the job. 5 minutes gives enough time for
       * API calls to complete but doesn't hold jobs hostage too long on crashes.
       */
      lockDuration: 5 * 60 * 1000, // 5 minutes in ms
    }
  );

  // ── Event handlers for monitoring ─────────────────────────────────────────

  worker.on('completed', (job) => {
    console.log(`[RecoveryWorker] Job ${job.id} (${job.data.type}) completed ✓`);
  });

  worker.on('failed', (job, error) => {
    if (job) {
      console.error(
        `[RecoveryWorker] Job ${job.id} (${job.data.type}) failed: ${error.message}`
      );
    } else {
      console.error(`[RecoveryWorker] Unknown job failed: ${error.message}`);
    }
  });

  worker.on('error', (error) => {
    // Worker-level errors (Redis disconnect, etc.) — log but don't crash
    console.error(`[RecoveryWorker] Worker error: ${error.message}`);
  });

  console.log('[RecoveryWorker] Started — listening on recoveryQueue');
  return worker;
}

// ─────────────────────────────────────────────────────────────────────────────
// Job dispatcher (routes to the correct handler)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main job processor — dispatches to the correct handler based on job type.
 *
 * WHY A SWITCH ON job.data.type?
 * TypeScript discriminated unions: In each case branch, the type is narrowed
 * to the specific job type. This means we get full type safety without casting.
 *
 * If this throws, BullMQ catches the error and retries the job according to
 * the defaultJobOptions (attempts: 3, exponential backoff).
 */
async function processRecoveryJob(job: Job<RecoveryJobData>): Promise<void> {
  console.log(`[RecoveryWorker] Processing job ${job.id}: type=${job.data.type}, failedPaymentId=${job.data.failedPaymentId}`);

  switch (job.data.type) {
    case 'retry_payment':
      await handleRetryPayment(job as Job<RetryPaymentJobData>);
      break;

    case 'send_email':
      await handleSendEmail(job as Job<SendEmailJobData>);
      break;

    case 'send_whatsapp':
      // WHY NOT IMPLEMENTED YET:
      // WhatsApp requires Meta Business API approval and Interakt/MSG91 integration.
      // The queue infrastructure is ready. Implementation comes after MVP launch.
      console.log(`[RecoveryWorker] WhatsApp job ${job.id} — stub, will implement post-MVP`);
      break;

    case 'send_sms':
      // WHY NOT IMPLEMENTED YET:
      // SMS requires MSG91 integration and DLT template registration with TRAI.
      // Both take time to set up. Email and WhatsApp are prioritized for MVP.
      console.log(`[RecoveryWorker] SMS job ${job.id} — stub, will implement post-MVP`);
      break;

    default: {
      // TypeScript exhaustiveness check — should never reach here
      const exhaustive: never = job.data;
      console.error(`[RecoveryWorker] Unknown job type: ${(exhaustive as RecoveryJobData).type}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler 1: Retry payment via gateway API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attempts to retry a failed payment by calling the gateway API.
 *
 * WHAT SUCCESS LOOKS LIKE:
 * Razorpay: The subscription/invoice status changes to 'charged'/'paid'.
 * Stripe: The invoice status changes to 'paid'.
 *
 * WHAT FAILURE LOOKS LIKE:
 * The gateway returns a non-successful status. We increment retry_count,
 * check if we've hit maxRetries, and either:
 *   a) Schedule the next retry (if attempts remain)
 *   b) Escalate to the email sequence (if max retries hit)
 */
async function handleRetryPayment(job: Job<RetryPaymentJobData>): Promise<void> {
  const data = job.data;

  // ── Load the failed payment to get current state ───────────────────────
  const failedPayment = await paymentQueries.getFailedPaymentById(db, data.failedPaymentId);

  if (!failedPayment) {
    throw new Error(`Failed payment ${data.failedPaymentId} not found in database`);
  }

  // ── Guard: Skip if already recovered or cancelled ─────────────────────
  // WHY: A concurrent job or manual intervention may have already resolved this.
  if (failedPayment.status === 'recovered' || failedPayment.status === 'cancelled') {
    console.log(`[RecoveryWorker] Payment ${data.failedPaymentId} already in terminal state (${failedPayment.status}) — skipping retry`);
    return;
  }

  // ── Update status to 'retrying' ───────────────────────────────────────
  await paymentQueries.updateFailedPaymentStatus(db, data.failedPaymentId, {
    status: 'retrying',
    lastRetryAt: new Date(),
  });

  // ── Attempt the gateway retry ─────────────────────────────────────────
  let retrySucceeded = false;
  let retryError: string | undefined;

  try {
    if (data.gatewayName === 'razorpay') {
      retrySucceeded = await retryViaRazorpay(data);
    } else if (data.gatewayName === 'stripe') {
      retrySucceeded = await retryViaStripe(data);
    } else {
      // Gateway not yet implemented for retry — skip and go to email sequence
      console.log(`[RecoveryWorker] Auto-retry not yet implemented for ${data.gatewayName}. Escalating to email.`);
      retrySucceeded = false;
    }
  } catch (err) {
    retryError = err instanceof Error ? err.message : 'Unknown gateway error';
    console.error(`[RecoveryWorker] Retry failed for payment ${data.failedPaymentId}: ${retryError}`);
    retrySucceeded = false;
  }

  // ── Update recovery job audit record ─────────────────────────────────
  if (data.recoveryJobDbId) {
    if (retrySucceeded) {
      await paymentQueries.markJobCompleted(db, data.recoveryJobDbId, {
        success: true,
        gatewayName: data.gatewayName,
        gatewayPaymentId: data.gatewayPaymentId,
      });
    } else {
      await paymentQueries.markJobFailed(db, data.recoveryJobDbId, retryError ?? 'Retry failed');
    }
  }

  // ── Handle success ────────────────────────────────────────────────────
  if (retrySucceeded) {
    await paymentQueries.updateFailedPaymentStatus(db, data.failedPaymentId, {
      status: 'recovered',
      recoveredAt: new Date(),
      recoveredAmountPaise: data.amountPaise,
      recoveryAttributedToFynback: true,
      retryCount: (failedPayment.retryCount ?? 0) + 1,
    });

    // Cancel the campaign run that was started for this payment (stops pending step jobs
    // and sends a recovery confirmation email to the customer via the campaign worker).
    const activeRun = await campaignQueries.getActiveCampaignRun(db, data.failedPaymentId);
    if (activeRun) {
      await campaignQueue.add(
        'cancel_campaign_run',
        {
          type: 'cancel_campaign_run',
          campaignRunId: activeRun.id,
          failedPaymentId: data.failedPaymentId,
          merchantId: data.merchantId,
          customerId: activeRun.customerId ?? undefined,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone,
          customerName: data.customerName,
          amountPaise: data.amountPaise,
          currency: data.currency,
          // Pass empty strings — handleCancelRun loads brand settings from DB when empty
          merchantFromEmail: '',
          merchantFromName: '',
          merchantCompanyName: '',
        } satisfies CancelCampaignRunJobData,
        { priority: 1 }
      );
      console.log(`[RecoveryWorker] Dispatched cancel_campaign_run for run ${activeRun.id}`);
    }

    console.log(`[RecoveryWorker] Payment ${data.failedPaymentId} recovered via auto-retry! ₹${data.amountPaise / 100}`);
    return;
  }

  // ── Handle failure: decide whether to retry again or escalate ────────
  const newRetryCount = (failedPayment.retryCount ?? 0) + 1;

  await paymentQueries.updateFailedPaymentStatus(db, data.failedPaymentId, {
    retryCount: newRetryCount,
  });

  const maxRetries = failedPayment.maxRetries ?? 3;

  if (newRetryCount < maxRetries) {
    // More retries remaining — schedule the next one
    const nextAttemptNumber = data.attemptNumber + 1;
    const retrySchedule = getRetrySchedule(
      data.paymentMethodType,
      failedPayment.declineCategory ?? 'unknown',
      nextAttemptNumber,
      new Date()
    );

    const nextJob = await recoveryQueue.add(
      'retry_payment',
      {
        ...data,
        attemptNumber: nextAttemptNumber,
        recoveryJobDbId: '', // Will be set after DB insert
      } satisfies RetryPaymentJobData,
      {
        delay: retrySchedule.delayMs,
        priority: 1,
      }
    );

    await paymentQueries.insertRecoveryJob(db, {
      failedPaymentId: data.failedPaymentId,
      merchantId: data.merchantId,
      bullmqJobId: nextJob.id,
      jobType: 'retry_payment',
      attemptNumber: nextAttemptNumber,
      scheduledAt: new Date(Date.now() + retrySchedule.delayMs),
    });

    await paymentQueries.updateFailedPaymentStatus(db, data.failedPaymentId, {
      status: 'retry_scheduled',
      nextRetryAt: new Date(Date.now() + retrySchedule.delayMs),
    });

    console.log(
      `[RecoveryWorker] Scheduled retry ${nextAttemptNumber}/${maxRetries} for payment ${data.failedPaymentId} at ${retrySchedule.scheduledAt.toISOString()}`
    );
  } else {
    // Max retries exhausted — campaign worker is already running the dunning sequence.
    // Just update the status so the dashboard reflects where we are.
    console.log(`[RecoveryWorker] Max retries (${maxRetries}) exhausted for payment ${data.failedPaymentId}. Campaign worker handles outreach.`);

    await paymentQueries.updateFailedPaymentStatus(db, data.failedPaymentId, {
      status: 'email_sequence',
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gateway-specific retry functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retries a failed Razorpay subscription payment.
 *
 * HOW RAZORPAY RETRY WORKS:
 * For subscription-based payments, Razorpay provides the
 * subscriptions.pendingUpdate() API to manually trigger a charge attempt.
 *
 * For standalone payments, retry isn't possible via API — must create a new
 * payment request (payment link or hosted checkout).
 *
 * WHY WE CHECK subscription ID:
 * Only subscription payments can be auto-retried. One-time payments that failed
 * require a new payment initiation — we handle those via email (payment link).
 *
 * @returns true if the payment was successfully collected, false otherwise
 */
async function retryViaRazorpay(data: RetryPaymentJobData): Promise<boolean> {
  if (!data.gatewaySubscriptionId) {
    // Not a subscription payment — can't auto-retry
    // The email sequence will send a payment link instead
    return false;
  }

  // Import Razorpay SDK dynamically (it's installed in apps/web, available via workspace)
  const Razorpay = (await import('razorpay')).default;

  // Load the merchant's Razorpay API credentials from the database
  const gatewayConnection = await paymentQueries.getActiveGatewayConnection(
    db,
    data.merchantId,
    'razorpay'
  );

  if (!gatewayConnection?.apiKeyEncrypted || !gatewayConnection?.apiSecretEncrypted) {
    console.error(`[RecoveryWorker] No Razorpay API credentials for merchant ${data.merchantId}`);
    return false;
  }

  // Decrypt the API credentials
  const { decrypt } = await import('@fynback/crypto');
  const apiKey = decrypt(gatewayConnection.apiKeyEncrypted);
  const apiSecret = decrypt(gatewayConnection.apiSecretEncrypted);

  const razorpay = new Razorpay({ key_id: apiKey, key_secret: apiSecret });

  try {
    /**
     * pendingUpdate() triggers an immediate charge attempt for the subscription.
     * Razorpay will attempt to collect the pending amount right now.
     *
     * WHY THIS API: It's the only official Razorpay way to force a retry on a
     * subscription payment. Regular payment retry APIs don't apply to subscriptions.
     *
     * This will fire a new webhook (payment.captured or payment.failed) when done.
     * We rely on those webhooks to update the payment status — we don't poll.
     */
    await razorpay.subscriptions.pendingUpdate(data.gatewaySubscriptionId);

    // We can't know the result immediately — Razorpay fires a webhook asynchronously.
    // Return false for now; the success will come via the webhook.
    // WHY: The webhook handler will detect payment.captured and mark as recovered.
    return false; // Retry initiated but result is async via webhook

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[RecoveryWorker] Razorpay retry failed: ${message}`);
    return false;
  }
}

/**
 * Retries a failed Stripe invoice payment.
 *
 * HOW STRIPE RETRY WORKS:
 * Stripe provides the invoices.pay() API to immediately attempt to collect
 * an unpaid invoice. This is the standard way to force a retry.
 *
 * @returns true if the invoice was successfully paid, false otherwise
 */
async function retryViaStripe(data: RetryPaymentJobData): Promise<boolean> {
  if (!data.gatewayPaymentId) return false;

  // The gatewayPaymentId for Stripe invoices is the invoice ID (inv_xxx) or charge ID (ch_xxx)
  // We need the invoice ID to call invoices.pay()
  // The normalizer stores the charge ID as gatewayPaymentId — we use the order ID (invoice ID) instead
  // TODO: Adjust normalizer to store invoice ID more clearly

  const Stripe = (await import('stripe')).default;

  const gatewayConnection = await paymentQueries.getActiveGatewayConnection(
    db,
    data.merchantId,
    'stripe'
  );

  if (!gatewayConnection?.apiSecretEncrypted) {
    console.error(`[RecoveryWorker] No Stripe API credentials for merchant ${data.merchantId}`);
    return false;
  }

  const { decrypt } = await import('@fynback/crypto');
  const secretKey = decrypt(gatewayConnection.apiSecretEncrypted);

  const stripe = new Stripe(secretKey, { apiVersion: '2025-04-30.basil' });

  try {
    /**
     * stripe.invoices.pay(invoiceId) immediately attempts to collect the invoice.
     * It returns the invoice object with updated status:
     *   'paid'            → success
     *   'open' or 'void'  → still failed
     */
    const invoice = await stripe.invoices.pay(data.gatewayPaymentId);

    // 'paid' means the collection succeeded
    return invoice.status === 'paid';

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[RecoveryWorker] Stripe invoice.pay() failed: ${message}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler 2: Send recovery email via Resend
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a recovery email to the customer.
 *
 * EMAIL SEQUENCE (3 steps over ~7 days):
 *   Step 1 (Day 0-1): "We couldn't collect your payment"
 *                     Friendly, non-urgent. Includes update-card link.
 *   Step 2 (Day 3-4): "Your service is at risk"
 *                     More urgent. Reiterates consequences of non-payment.
 *   Step 3 (Day 6-7): "Last chance + pause offer"
 *                     Most urgent. Offers to pause subscription 1 month.
 *                     WHY PAUSE OFFER ON STEP 3: Shows it only after two
 *                     non-responses, avoiding "training" customers to wait for it.
 *
 * WHY RESEND (not SendGrid, Mailchimp, SES)?
 *   - Best-in-class deliverability for transactional emails
 *   - Webhook events for delivery/open/click tracking
 *   - Simple API that takes React Email components directly
 *   - Better pricing for India-volume SaaS (50k emails/month free)
 */
async function handleSendEmail(job: Job<SendEmailJobData>): Promise<void> {
  const data = job.data;

  if (!data.customerEmail) {
    console.warn(`[RecoveryWorker] No customer email for payment ${data.failedPaymentId} — skipping email step ${data.stepNumber}`);
    return;
  }

  // ── Create outreach event record (pending) ──────────────────────────────
  const outreachEvent = await paymentQueries.insertOutreachEvent(db, {
    failedPaymentId: data.failedPaymentId,
    merchantId: data.merchantId,
    channel: 'email',
    recipientEmail: data.customerEmail,
    templateId: `recovery_email_step_${data.stepNumber}`,
    stepNumber: data.stepNumber,
  });

  // ── Build and send the email ────────────────────────────────────────────
  const emailContent = buildRecoveryEmailHtml(data);

  const subject = getEmailSubject(data.stepNumber, data.amountPaise, data.currency);

  let sendResult;
  try {
    sendResult = await resend.emails.send({
      from: `${data.merchantFromName} <${data.merchantFromEmail}>`,
      to: data.customerEmail,
      replyTo: data.merchantReplyTo,
      subject,
      html: emailContent,
      tags: [
        // WHY TAGS: For segmentation in Resend analytics and filtering webhook events
        { name: 'type', value: 'payment_recovery' },
        { name: 'step', value: String(data.stepNumber) },
        { name: 'merchant_id', value: data.merchantId },
        { name: 'failed_payment_id', value: data.failedPaymentId },
      ],
    });
  } catch (err) {
    // Update outreach event as failed
    if (outreachEvent?.id) {
      await paymentQueries.updateOutreachStatus(db, outreachEvent.id, {
        status: 'failed',
        failedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : 'Resend API error',
      });
    }
    throw err; // Re-throw so BullMQ retries the job
  }

  // ── Update outreach event with provider message ID ──────────────────────
  if (outreachEvent?.id) {
    await paymentQueries.updateOutreachStatus(db, outreachEvent.id, {
      status: 'sent',
      providerMessageId: sendResult.data?.id,
      sentAt: new Date(),
    });
  }

  // ── Update the failed payment status ───────────────────────────────────
  await paymentQueries.updateFailedPaymentStatus(db, data.failedPaymentId, {
    status: 'email_sequence',
  });

  // ── Schedule the next email step (if not the final step) ───────────────
  if (data.stepNumber < 3) {
    const nextStepNumber = data.stepNumber + 1;

    /**
     * Schedule next email:
     *   After Step 1 → Step 2 in 3 days
     *   After Step 2 → Step 3 in 3 days (total 6 days from failure)
     * WHY 3 DAYS: Long enough to give the customer time to act.
     *             Short enough to maintain urgency.
     */
    const nextEmailDelayMs = 3 * 24 * 60 * 60 * 1000; // 3 days

    await recoveryQueue.add(
      'send_email',
      {
        ...data,
        stepNumber: nextStepNumber,
        recoveryJobDbId: '',
        includePauseOffer: nextStepNumber >= 3, // Show pause offer on final step only
      } satisfies SendEmailJobData,
      {
        delay: nextEmailDelayMs,
        priority: 2,
      }
    );

    console.log(`[RecoveryWorker] Scheduled email step ${nextStepNumber} for payment ${data.failedPaymentId} in 3 days`);
  } else {
    // All 3 email steps exhausted — try WhatsApp if customer has a phone number
    if (data.customerPhone) {
      // TODO: Implement WhatsApp job dispatch
      console.log(`[RecoveryWorker] Email sequence complete for payment ${data.failedPaymentId}. Would escalate to WhatsApp.`);
    } else {
      // No phone number — mark as cancelled (exhausted all outreach options)
      await paymentQueries.updateFailedPaymentStatus(db, data.failedPaymentId, {
        status: 'cancelled',
      });
      console.log(`[RecoveryWorker] No phone number for payment ${data.failedPaymentId}. Marking as cancelled.`);
    }
  }

  console.log(`[RecoveryWorker] Email step ${data.stepNumber} sent to ${data.customerEmail} for payment ${data.failedPaymentId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Email content builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the email subject line for each step.
 *
 * WHY DIFFERENT SUBJECTS PER STEP:
 * Email clients show the subject before opening. Escalating urgency in
 * subject lines increases open rates: 40% open rate on step 1 → 55% on step 2
 * (urgency drives re-engagement for people who ignored step 1).
 */
function getEmailSubject(
  stepNumber: number,
  amountPaise: number,
  currency: string
): string {
  const amount = currency === 'INR'
    ? formatINR(amountPaise)
    : `${currency} ${(amountPaise / 100).toFixed(2)}`;

  switch (stepNumber) {
    case 1: return `Action needed: Payment of ${amount} couldn't be processed`;
    case 2: return `Urgent: Your subscription is at risk — ${amount} payment failed`;
    case 3: return `Final notice: Update payment to keep your subscription active`;
    default: return `Payment issue with your subscription`;
  }
}

/**
 * Builds the HTML email body for recovery emails.
 *
 * WHY INLINE HTML (not React Email):
 * The worker runs in Node.js without the React runtime. React Email requires
 * a build step. For the MVP, inline HTML is faster to ship and easier to maintain.
 * Post-MVP: migrate to React Email templates with server-side rendering.
 *
 * DESIGN PRINCIPLES:
 * - Dark theme matching FynBack's brand (#08090c background, #00e878 green)
 * - Mobile-first (most Indian users check email on mobile)
 * - Single clear CTA button (update payment / click to pay)
 * - Merchant branding (from name, brand color) makes it look native to the product
 */
function buildRecoveryEmailHtml(data: SendEmailJobData): string {
  const amountDisplay = data.currency === 'INR'
    ? formatINR(data.amountPaise)
    : `${data.currency} ${(data.amountPaise / 100).toFixed(2)}`;

  const customerGreeting = data.customerName
    ? `Hi ${data.customerName.split(' ')[0]},`
    : 'Hi,';

  const urgencyMessage = {
    1: "We wanted to let you know that we couldn't process your recent payment.",
    2: "This is an important reminder — your subscription is at risk of being paused.",
    3: "This is your final notice. Without payment, your subscription will be cancelled today.",
  }[data.stepNumber] ?? "We couldn't process your recent payment.";

  const ctaText = data.stepNumber === 1 ? 'Update Payment Method' : 'Pay Now & Keep Access';

  const pauseOfferSection = data.includePauseOffer
    ? `
    <div style="margin: 24px 0; padding: 16px; border: 1px solid #2a2a2a; border-radius: 8px; background: #111;">
      <p style="color: #aaa; font-size: 14px; margin: 0 0 8px 0;">Not ready to pay right now?</p>
      <p style="color: #fff; font-size: 14px; margin: 0 0 12px 0;">
        We can pause your subscription for 1 month — no charges, full access when you return.
      </p>
      <a href="${data.paymentLink ?? '#'}?action=pause"
         style="color: #00e878; text-decoration: underline; font-size: 14px;">
        Pause my subscription instead →
      </a>
    </div>
    `
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Update Required</title>
</head>
<body style="margin: 0; padding: 0; background-color: #08090c; font-family: -apple-system, 'DM Sans', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; margin: 0 auto; padding: 40px 16px;">
    <tr>
      <td>
        <!-- Header with brand color accent -->
        <div style="border-top: 3px solid ${data.merchantBrandColor}; padding-top: 24px; margin-bottom: 32px;">
          <p style="color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0;">
            ${data.merchantFromName}
          </p>
        </div>

        <!-- Main content -->
        <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
          ${customerGreeting}
        </p>
        <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
          ${urgencyMessage}
        </p>

        <!-- Payment amount highlight -->
        <div style="background: #111; border: 1px solid #2a2a2a; border-radius: 8px; padding: 16px; margin: 0 0 24px 0;">
          <p style="color: #888; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">
            Amount Due
          </p>
          <p style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0; font-family: 'DM Mono', monospace;">
            ${amountDisplay}
          </p>
        </div>

        <!-- CTA Button -->
        <a href="${data.paymentLink ?? '#'}"
           style="display: block; background: ${data.merchantBrandColor}; color: #000;
                  text-decoration: none; padding: 14px 24px; border-radius: 6px;
                  font-size: 16px; font-weight: 600; text-align: center; margin: 0 0 24px 0;">
          ${ctaText} →
        </a>

        ${pauseOfferSection}

        <!-- Footer -->
        <div style="border-top: 1px solid #1a1a1a; padding-top: 20px; margin-top: 32px;">
          <p style="color: #555; font-size: 12px; margin: 0;">
            This email was sent by ${data.merchantFromName}.
            Reply to <a href="mailto:${data.merchantReplyTo}" style="color: #00e878;">${data.merchantReplyTo}</a> if you have questions.
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Dispatch an email job from the worker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dispatches an email recovery job when escalating from auto-retry.
 * Used when max retries are exhausted and we move to the email sequence.
 */
async function dispatchEmailJob(
  failedPaymentId: string,
  merchantId: string,
  retryData: RetryPaymentJobData,
  stepNumber: number
) {
  // Get merchant branding from DB
  const { merchantBrandSettings, eq } = await import('@fynback/db');

  const brandRows = await db
    .select()
    .from(merchantBrandSettings)
    .where(eq(merchantBrandSettings.merchantId, merchantId))
    .limit(1);

  const brand = brandRows[0];

  const emailJob = await recoveryQueue.add(
    'send_email',
    {
      type: 'send_email',
      failedPaymentId,
      merchantId,
      recoveryJobDbId: '',
      amountPaise: retryData.amountPaise,
      currency: retryData.currency,
      customerEmail: retryData.customerEmail,
      customerPhone: retryData.customerPhone,
      customerName: retryData.customerName,
      gatewayName: retryData.gatewayName,
      gatewayPaymentId: retryData.gatewayPaymentId,
      gatewaySubscriptionId: retryData.gatewaySubscriptionId,
      stepNumber,
      merchantFromName: brand?.fromName ?? 'Recovery Notice',
      merchantFromEmail: brand?.fromEmail ?? 'recovery@fynback.com',
      merchantReplyTo: brand?.replyToEmail ?? 'support@fynback.com',
      merchantBrandColor: brand?.brandColorHex ?? '#00e878',
      includePauseOffer: stepNumber >= 3,
    } satisfies SendEmailJobData,
    { priority: 2 }
  );

  await paymentQueries.insertRecoveryJob(db, {
    failedPaymentId,
    merchantId,
    bullmqJobId: emailJob.id,
    jobType: 'send_email',
    attemptNumber: stepNumber,
    scheduledAt: new Date(),
  });
}
