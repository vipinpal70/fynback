/**
 * interakt.ts — FynBack's Interakt API client
 *
 * KEY ARCHITECTURE DECISION:
 * Every function takes `apiKey` as an explicit parameter.
 * The API key is stored ENCRYPTED per-merchant in merchant_brand_settings.interakt_api_key_encrypted.
 * The caller (campaign.worker.ts, API routes) is responsible for decrypting and passing it.
 * This client is stateless and multi-tenant safe.
 *
 * COMPLETE API SURFACE USED:
 *   POST /v1/public/track/users/          → sync customer profile
 *   POST /v1/public/track/events/         → track payment_failed / payment_recovered events
 *   POST /v1/public/message/              → send template messages (+ SMS fallback)
 *   POST /v1/public/track/templates/      → create/provision templates
 *   GET  /v1/public/track/organization/templates → list templates + check approval
 *   POST /v1/public/create-campaign/      → create Interakt campaign for analytics
 *   POST /v1/public/assignment/           → assign chat to merchant agent
 *
 * TEMPLATE BODIES (submit as UTILITY category in Interakt > Templates):
 *
 *   fynback_payment_failed_soft_v1   — step 1, friendly
 *     "Hi {{1}}, we noticed your payment of {{2}} for {{3}} didn't go through.
 *      Complete it here: {{4}} 🙏  Reply STOP to opt out."
 *
 *   fynback_payment_failed_urgent_v1 — step 2, clear risk
 *     "Hi {{1}}, your payment of {{2}} for {{3}} is still pending and your
 *      subscription is at risk. Update payment: {{4}}  Need help? Reply here."
 *
 *   fynback_payment_failed_final_v1  — step 3+, pause offer
 *     "Hi {{1}}, last reminder — {{2}} payment for {{3}} is overdue.
 *      Pay here: {{4}}  OR reply PAUSE to pause subscription instead."
 *
 *   fynback_payment_recovered_v1     — recovery confirmation
 *     "Hi {{1}}, great news! ✅ Your payment of {{2}} for {{3}} is received.
 *      Your subscription is fully active. Thank you!"
 *
 * ENV VARS:
 *   INTERAKT_API_KEY  — FynBack's own system-level Interakt key (fallback only)
 *                       Per-merchant keys come from DB and are passed explicitly.
 */

const INTERAKT_BASE = 'https://api.interakt.ai/v1/public';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface InteraktSendResult {
  /** Interakt message UUID — store as providerMessageId in outreach_events */
  id: string;
  queued: boolean;
}

export interface SmsFallbackParams {
  /** DLT-registered 6-char sender ID (e.g. "FYNBAK") */
  senderId: string;
  /** DLT Principal Entity ID */
  peId: string;
  /** DLT-approved SMS body with {{1}}, {{2}} placeholders */
  message: string;
  /** DLT Template Entity ID */
  dltTeId: string;
  /** Variable values for {{1}}, {{2}}, ... in SMS body */
  variables?: string[];
}

export interface WhatsAppTemplateParams {
  apiKey: string;
  /** Full phone with country prefix, no spaces (e.g. "919876543210") */
  fullPhoneNumber: string;
  /** Template code name from Interakt (not display name) — must be APPROVED */
  templateName: string;
  languageCode?: string;
  bodyValues: string[];
  headerValues?: string[];
  /**
   * Dynamic URL button values. Key = button index (0-based string), value = variable array.
   * Use for payment link CTA buttons: { "0": ["pay-link-unique-part"] }
   */
  buttonValues?: Record<string, string[]>;
  /**
   * ALWAYS "utility" for FynBack recovery messages.
   * Guards against Meta's silent Utility→Marketing recategorisation (5-6x cost).
   */
  templateCategory?: 'utility' | 'marketing' | 'authentication';
  callbackData?: string;
  campaignId?: string;
  /** Optional SMS fallback — sends SMS if WhatsApp delivery fails */
  smsFallback?: SmsFallbackParams;
}

export interface TrackEventParams {
  apiKey: string;
  fullPhoneNumber: string;
  eventName: string;
  traits?: Record<string, string | number | boolean | null>;
}

export interface UserSyncParams {
  apiKey: string;
  fullPhoneNumber: string;
  name?: string;
  email?: string;
  extraTraits?: Record<string, string | number | boolean>;
}

export interface InteraktTemplate {
  id: string;
  name: string;
  displayName: string;
  approvalStatus: 'APPROVED' | 'WAITING' | 'REJECTED';
  category: string;
  body: string;
  language: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phone normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Produces Interakt's fullPhoneNumber format: all digits, country code first, no plus.
 * "+91 98765 43210" → "919876543210"
 * "9876543210"      → "919876543210"  (assumes India)
 */
export function toFullPhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `91${digits.slice(1)}`;
  if (digits.length === 10) return `91${digits}`;
  return digits; // non-Indian or already normalized
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth + retry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Correct Interakt auth header.
 * The API key IS the credential — do NOT base64-encode it again.
 */
function authHeader(apiKey: string): string {
  return `Basic ${apiKey}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithBackoff(url: string, init: RequestInit, maxRetries = 4): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt >= maxRetries) return res;

    const retryAfterSec = res.headers.get('Retry-After');
    const backoffMs = retryAfterSec
      ? parseInt(retryAfterSec, 10) * 1000
      : Math.min(1000 * 2 ** attempt + Math.random() * 500, 30_000);

    console.warn(`[Interakt] Rate limited (attempt ${attempt + 1}/${maxRetries + 1}) — retrying in ${Math.round(backoffMs)}ms`);
    await sleep(backoffMs);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// User Track API — sync customer profile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upserts a customer in Interakt's user database.
 *
 * WHY: Interakt's Inbox shows customer name/email when merchant support teams chat.
 * Enables segmentation, automation triggers, and opt-out tracking.
 * Also required for Interakt's own automation flows to work correctly.
 *
 * Best-effort — failure never blocks the WhatsApp send.
 */
export async function syncInteraktUser(params: UserSyncParams): Promise<void> {
  const fullPhone = toFullPhoneNumber(params.fullPhoneNumber);
  const phoneNumber = fullPhone.startsWith('91') ? fullPhone.slice(2) : fullPhone;
  const countryCode = '+91';

  const traits: Record<string, unknown> = {
    ...(params.name ? { name: params.name } : {}),
    ...(params.email ? { email: params.email } : {}),
    ...(params.extraTraits ?? {}),
    _internal_lead_source: 'FynBack',
  };

  try {
    const res = await fetchWithBackoff(`${INTERAKT_BASE}/track/users/`, {
      method: 'POST',
      headers: { Authorization: authHeader(params.apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, countryCode, traits }),
    }, 2);

    if (!res.ok) {
      const body = await res.text();
      console.warn(`[Interakt] User sync (${res.status}): ${body}`);
    }
  } catch (err) {
    console.warn(`[Interakt] User sync error (non-fatal): ${err}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Track API — record business events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tracks a business event against a customer in Interakt.
 *
 * FynBack events:
 *   "payment_failed"    → triggers Interakt automation sequences
 *   "payment_recovered" → marks the customer as recovered in Interakt analytics
 *
 * WHY THIS MATTERS:
 * Interakt's automation engine can trigger its own WhatsApp flows based on events.
 * Merchants who have set up Interakt automations get double coverage.
 * Also enables Interakt's customer segmentation (e.g. "customers with payment_failed event").
 *
 * Best-effort — never throws.
 */
export async function trackInteraktEvent(params: TrackEventParams): Promise<void> {
  const fullPhone = toFullPhoneNumber(params.fullPhoneNumber);

  try {
    const res = await fetchWithBackoff(`${INTERAKT_BASE}/track/events/`, {
      method: 'POST',
      headers: { Authorization: authHeader(params.apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullPhoneNumber: fullPhone,
        event: params.eventName,
        traits: params.traits ?? {},
      }),
    }, 2);

    if (!res.ok) {
      const body = await res.text();
      console.warn(`[Interakt] Event track (${res.status}): ${body}`);
    } else {
      console.log(`[Interakt] Event "${params.eventName}" tracked for ${fullPhone}`);
    }
  } catch (err) {
    console.warn(`[Interakt] Event track error (non-fatal): ${err}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Send Template Message
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a pre-approved WhatsApp template message via Interakt.
 *
 * KEY SAFETY: template_category: "utility" guard.
 * Meta silently recategorises templates Utility→Marketing with no warning.
 * Marketing costs 5-6x more and delivers at 50-70% rate.
 * Passing template_category makes Interakt REJECT the send instead of silently billing more.
 * The error bubbles up so we can alert the merchant to re-submit the template.
 *
 * SMS FALLBACK:
 * When smsFallback is provided, Interakt sends SMS if WhatsApp delivery fails.
 * This requires merchant's DLT registration (sender_id, pe_id, dlt_te_id).
 * Stored in merchant_brand_settings.msg91_sender_id, dlt_entity_id.
 *
 * DYNAMIC CTA BUTTON:
 * buttonValues puts a customer-specific URL directly in the WhatsApp button.
 * Better UX than embedding the URL in body text — tappable, no copy-paste.
 */
export async function sendWhatsAppTemplate(params: WhatsAppTemplateParams): Promise<InteraktSendResult> {
  const fullPhone = toFullPhoneNumber(params.fullPhoneNumber);

  const templateObj: Record<string, unknown> = {
    name: params.templateName,
    languageCode: params.languageCode ?? 'en',
    bodyValues: params.bodyValues,
  };

  if (params.headerValues?.length) {
    templateObj.headerValues = params.headerValues;
  }
  if (params.buttonValues && Object.keys(params.buttonValues).length > 0) {
    templateObj.buttonValues = params.buttonValues;
  }

  const payload: Record<string, unknown> = {
    fullPhoneNumber: fullPhone,
    template_category: params.templateCategory ?? 'utility',
    callbackData: params.callbackData,
    type: 'Template',
    template: templateObj,
  };

  if (params.campaignId) {
    payload.campaignId = params.campaignId;
  }

  // SMS fallback — sends SMS if WhatsApp delivery fails
  if (params.smsFallback) {
    payload.fallback = [{
      channel: 'sms',
      sender_id: params.smsFallback.senderId,
      pe_id: params.smsFallback.peId,
      provider_name: 'default',
      content: {
        message: params.smsFallback.message,
        dlt_te_id: params.smsFallback.dltTeId,
        variables: params.smsFallback.variables ?? [],
      },
    }];
  }

  const response = await fetchWithBackoff(`${INTERAKT_BASE}/message/`, {
    method: 'POST',
    headers: { Authorization: authHeader(params.apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`[Interakt] Template send failed (${response.status}): ${body}`);
  }

  const json = await response.json() as { result?: boolean; id?: string; message?: string };

  if (!json.result || !json.id) {
    throw new Error(`[Interakt] Unexpected response: ${JSON.stringify(json)}`);
  }

  return { id: json.id, queued: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Template management
// ─────────────────────────────────────────────────────────────────────────────

export async function listInteraktTemplates(
  apiKey: string,
  opts?: { approvalStatus?: 'APPROVED' | 'WAITING' | 'REJECTED'; templateName?: string },
): Promise<InteraktTemplate[]> {
  const params = new URLSearchParams({ offset: '0', language: 'all' });
  if (opts?.approvalStatus) params.set('approval_status', opts.approvalStatus);
  if (opts?.templateName) params.set('template_name', opts.templateName);

  const res = await fetchWithBackoff(
    `${INTERAKT_BASE}/track/organization/templates?${params.toString()}`,
    { headers: { Authorization: authHeader(apiKey), 'Content-Type': 'application/json' } },
    2,
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[Interakt] List templates (${res.status}): ${body}`);
  }

  const json = await res.json() as {
    results?: { templates?: Array<{
      id: string; name: string; display_name: string;
      approval_status: string; category: string; body: string; language: string;
    }> };
  };

  return (json.results?.templates ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    displayName: t.display_name,
    approvalStatus: t.approval_status as InteraktTemplate['approvalStatus'],
    category: t.category,
    body: t.body,
    language: t.language,
  }));
}

export async function isTemplateApproved(apiKey: string, templateName: string): Promise<boolean> {
  try {
    const templates = await listInteraktTemplates(apiKey, { templateName, approvalStatus: 'APPROVED' });
    return templates.some((t) => t.name === templateName);
  } catch {
    return true; // optimistic — don't block sends on API errors
  }
}

export async function createFynBackTemplate(
  apiKey: string,
  def: FynBackTemplateDef,
): Promise<string> {
  const payload: Record<string, unknown> = {
    display_name: def.displayName,
    language: 'English',
    category: 'Utility',
    header_format: null,
    body: def.body,
    body_text: def.bodySampleValues,
    footer: 'Reply STOP to opt out.',
  };

  if (def.ctaButtonUrl) {
    payload.button_type = 'Call To Action';
    payload.buttons = [{
      type: 'URL',
      text: def.ctaButtonText ?? 'Complete Payment',
      url: def.ctaButtonUrl,
    }];
    payload.button_text = def.ctaButtonSampleUrl ?? def.ctaButtonUrl;
  }

  const res = await fetchWithBackoff(`${INTERAKT_BASE}/track/templates/`, {
    method: 'POST',
    headers: { Authorization: authHeader(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[Interakt] Create template (${res.status}): ${body}`);
  }

  const json = await res.json() as { data?: { id?: string } };
  if (!json.data?.id) throw new Error('[Interakt] Template creation missing ID');

  return json.data.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Campaign management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an Interakt campaign for unified analytics.
 * Links all template sends to this campaign ID for delivery/read rate tracking.
 */
export async function createInteraktCampaign(
  apiKey: string,
  opts: { name: string; templateName: string; languageCode?: string },
): Promise<string> {
  const res = await fetchWithBackoff(`${INTERAKT_BASE}/create-campaign/`, {
    method: 'POST',
    headers: { Authorization: authHeader(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaign_name: opts.name,
      campaign_type: 'PublicAPI',
      template_name: opts.templateName,
      language_code: opts.languageCode ?? 'en',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[Interakt] Create campaign (${res.status}): ${body}`);
  }

  const json = await res.json() as { data?: { campaignId?: string } };
  if (!json.data?.campaignId) throw new Error('[Interakt] Campaign creation missing campaignId');

  return json.data.campaignId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat Assignment API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assigns a customer's WhatsApp chat to a specific agent in Interakt Inbox.
 *
 * USE CASE: When a dunning campaign is exhausted (all steps sent, no payment),
 * FynBack assigns the chat to the merchant's support agent so they can personally
 * reach out. This is the human-in-the-loop fallback after automation fails.
 *
 * agentEmail must match an agent registered in the merchant's Interakt account.
 * Best-effort — non-fatal.
 */
export async function assignInteraktChat(
  apiKey: string,
  opts: { customerPhone: string; agentEmail: string },
): Promise<void> {
  const fullPhone = toFullPhoneNumber(opts.customerPhone);

  try {
    const res = await fetchWithBackoff(`${INTERAKT_BASE}/assignment/`, {
      method: 'POST',
      headers: { Authorization: authHeader(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_phone_number: fullPhone,
        agent_email: opts.agentEmail,
      }),
    }, 2);

    if (!res.ok) {
      const body = await res.text();
      console.warn(`[Interakt] Chat assignment (${res.status}): ${body}`);
    } else {
      console.log(`[Interakt] Chat assigned: ${fullPhone} → ${opts.agentEmail}`);
    }
  } catch (err) {
    console.warn(`[Interakt] Chat assignment error (non-fatal): ${err}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FynBack template definitions
// ─────────────────────────────────────────────────────────────────────────────

export interface FynBackTemplateDef {
  name: string;
  displayName: string;
  body: string;
  bodySampleValues: string[];
  /** Optional CTA button URL (supports {{1}} variable for dynamic payment links) */
  ctaButtonUrl?: string;
  ctaButtonText?: string;
  ctaButtonSampleUrl?: string;
}

/**
 * FynBack's 4 recovery templates.
 *
 * Variable map (consistent across all):
 *   {{1}} = customer first name
 *   {{2}} = formatted amount ("₹2,500")
 *   {{3}} = merchant/product name
 *   {{4}} = payment link (body text version — also in button if using CTA template)
 *
 * Submit ALL as category = Utility in Interakt > Templates > Create.
 */
export const FYNBACK_TEMPLATE_DEFS: FynBackTemplateDef[] = [
  {
    name: 'fynback_payment_failed_soft_v1',
    displayName: 'FynBack - Payment Failed (Soft)',
    body:
      "Hi {{1}}, we noticed your payment of {{2}} for {{3}} didn't go through.\n\n" +
      'This could be a temporary issue. Please complete your payment here:\n{{4}}\n\n' +
      'Thank you for being a valued customer! 🙏',
    bodySampleValues: ['Rahul', '₹2,500', 'Acme SaaS', 'https://pay.fynback.com/abc123'],
  },
  {
    name: 'fynback_payment_failed_urgent_v1',
    displayName: 'FynBack - Payment Failed (Urgent)',
    body:
      'Hi {{1}}, your payment of {{2}} for {{3}} is still pending and your ' +
      'subscription is at risk of cancellation.\n\nPlease update your payment:\n{{4}}\n\n' +
      'Need help? Reply to this message and we\'ll sort it out.',
    bodySampleValues: ['Rahul', '₹2,500', 'Acme SaaS', 'https://pay.fynback.com/abc123'],
  },
  {
    name: 'fynback_payment_failed_final_v1',
    displayName: 'FynBack - Payment Failed (Final)',
    body:
      "Hi {{1}}, this is our final reminder — your payment of {{2}} for {{3}} is overdue.\n\n" +
      'Complete payment here: {{4}}\n\n' +
      "OR reply *PAUSE* to pause your subscription instead of losing access.",
    bodySampleValues: ['Rahul', '₹2,500', 'Acme SaaS', 'https://pay.fynback.com/abc123'],
  },
  {
    name: 'fynback_payment_recovered_v1',
    displayName: 'FynBack - Payment Recovered',
    body:
      'Hi {{1}}, great news! ✅\n\n' +
      'Your payment of {{2}} for {{3}} has been received. ' +
      'Your subscription is fully active.\n\nThank you for staying with us!',
    bodySampleValues: ['Rahul', '₹2,500', 'Acme SaaS'],
  },
];

export const INTERAKT_TEMPLATES = {
  PAYMENT_FAILED_SOFT:    'fynback_payment_failed_soft_v1',
  PAYMENT_FAILED_URGENT:  'fynback_payment_failed_urgent_v1',
  PAYMENT_FAILED_FINAL:   'fynback_payment_failed_final_v1',
  PAYMENT_RECOVERED:      'fynback_payment_recovered_v1',
} as const;

export function pickDunningTemplate(stepNumber: number): string {
  if (stepNumber <= 1) return INTERAKT_TEMPLATES.PAYMENT_FAILED_SOFT;
  if (stepNumber === 2) return INTERAKT_TEMPLATES.PAYMENT_FAILED_URGENT;
  return INTERAKT_TEMPLATES.PAYMENT_FAILED_FINAL;
}

// ─────────────────────────────────────────────────────────────────────────────
// Template provisioning
// ─────────────────────────────────────────────────────────────────────────────

export async function provisionFynBackTemplates(
  apiKey: string,
): Promise<Array<{ name: string; status: 'created' | 'already_exists' | 'error'; error?: string }>> {
  let existingNames: Set<string>;
  try {
    const existing = await listInteraktTemplates(apiKey);
    existingNames = new Set(existing.map((t) => t.name));
  } catch {
    existingNames = new Set();
  }

  const results: Array<{ name: string; status: 'created' | 'already_exists' | 'error'; error?: string }> = [];

  for (const def of FYNBACK_TEMPLATE_DEFS) {
    if (existingNames.has(def.name)) {
      results.push({ name: def.name, status: 'already_exists' });
      continue;
    }
    try {
      await createFynBackTemplate(apiKey, def);
      results.push({ name: def.name, status: 'created' });
    } catch (err) {
      results.push({ name: def.name, status: 'error', error: String(err) });
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// High-level helpers (called by campaign.worker.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Primary dunning send: sync customer → track event → send template.
 *
 * Requires the merchant's decrypted Interakt API key.
 * merchant_brand_settings.interakt_api_key_encrypted → decrypt → pass here.
 */
export async function sendDunningWhatsApp(opts: {
  apiKey: string;
  phone: string;
  customerName?: string;
  customerEmail?: string;
  amountFormatted: string;
  merchantName: string;
  paymentLink: string;
  stepNumber: number;
  campaignRunId: string;
  interaktCampaignId?: string;
  /** Optional SMS fallback if merchant has DLT registration */
  smsFallback?: SmsFallbackParams;
}): Promise<string | undefined> {
  const fullPhone = toFullPhoneNumber(opts.phone);
  const firstName = opts.customerName?.split(' ')[0] ?? 'there';

  // 1. Sync customer profile to Interakt (best-effort)
  await syncInteraktUser({
    apiKey: opts.apiKey,
    fullPhoneNumber: opts.phone,
    name: opts.customerName,
    email: opts.customerEmail,
    extraTraits: { fynback_merchant: opts.merchantName },
  });

  // 2. Track payment_failed event (enables Interakt automation + analytics)
  await trackInteraktEvent({
    apiKey: opts.apiKey,
    fullPhoneNumber: opts.phone,
    eventName: 'payment_failed',
    traits: {
      amount: opts.amountFormatted,
      merchant: opts.merchantName,
      step: opts.stepNumber,
      campaign_run_id: opts.campaignRunId,
    },
  });

  // 3. Send template
  const templateName = pickDunningTemplate(opts.stepNumber);
  const result = await sendWhatsAppTemplate({
    apiKey: opts.apiKey,
    fullPhoneNumber: opts.phone,
    templateName,
    languageCode: 'en',
    templateCategory: 'utility',
    bodyValues: [firstName, opts.amountFormatted, opts.merchantName, opts.paymentLink],
    callbackData: `campaign_run:${opts.campaignRunId}:step:${opts.stepNumber}`,
    campaignId: opts.interaktCampaignId,
    smsFallback: opts.smsFallback,
  });

  console.log(`[Interakt] WhatsApp sent to ${fullPhone}, step ${opts.stepNumber}, id: ${result.id}`);
  return result.id;
}

/**
 * Recovery confirmation WhatsApp — sent on payment recovery.
 * Also tracks payment_recovered event in Interakt.
 * Best-effort — never throws.
 */
export async function sendRecoveryConfirmationWhatsApp(opts: {
  apiKey: string;
  phone: string;
  customerName?: string;
  amountFormatted: string;
  merchantName: string;
}): Promise<string | undefined> {
  const firstName = opts.customerName?.split(' ')[0] ?? 'there';

  // Track recovery event in Interakt
  await trackInteraktEvent({
    apiKey: opts.apiKey,
    fullPhoneNumber: opts.phone,
    eventName: 'payment_recovered',
    traits: {
      amount: opts.amountFormatted,
      merchant: opts.merchantName,
    },
  });

  try {
    const result = await sendWhatsAppTemplate({
      apiKey: opts.apiKey,
      fullPhoneNumber: opts.phone,
      templateName: INTERAKT_TEMPLATES.PAYMENT_RECOVERED,
      languageCode: 'en',
      templateCategory: 'utility',
      bodyValues: [firstName, opts.amountFormatted, opts.merchantName],
      callbackData: 'recovery_confirmed',
    });
    return result.id;
  } catch (err) {
    console.warn(`[Interakt] Recovery confirmation WhatsApp failed (non-fatal): ${err}`);
    return undefined;
  }
}
