/**
 * /api/settings/whatsapp-templates
 *
 * GET  → Check approval status of all 4 FynBack recovery templates in Interakt.
 *        Called by the WhatsApp settings page to show a "pending approval" banner
 *        or a "templates ready" green checkmark.
 *
 * POST → Provision (create) all 4 FynBack recovery templates in Interakt.
 *        Called when a merchant saves their Interakt API key for the first time.
 *        Skips templates that already exist.
 *        Newly created templates go into WAITING state — Meta approval: 24-72h.
 *
 * WHY TEMPLATES MUST BE PRE-CREATED:
 * WhatsApp Business API only allows sending pre-approved templates for outbound
 * (business-initiated) messages. FynBack must create its 4 recovery templates
 * in the merchant's Interakt account and wait for Meta approval before
 * any WhatsApp recovery messages can be sent.
 *
 * WHY API KEY IS PASSED IN REQUEST (not from env):
 * Each merchant has their OWN Interakt account with their own API key.
 * The env var INTERAKT_API_KEY is the FynBack system default — merchants
 * who connect their own Interakt account pass their key explicitly.
 * (For MVP, FynBack's own key is used for all merchants. This route
 *  is forward-compatible for per-merchant Interakt keys.)
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { createDb, users, memberships, merchantBrandSettings, eq } from '@fynback/db';
import { decrypt } from '@fynback/crypto';

const db = createDb(process.env.DATABASE_URL!);

// ─────────────────────────────────────────────────────────────────────────────
// Template definitions (duplicated from apps/worker/src/lib/interakt.ts)
// Can't import from worker — cross-app deps break Turborepo.
// If these change, update both files.
// ─────────────────────────────────────────────────────────────────────────────

const FYNBACK_TEMPLATE_DEFS = [
  {
    name: 'fynback_payment_failed_soft_v1',
    displayName: 'FynBack Payment Failed - Soft Reminder',
    body:
      "Hi {{1}}, we noticed your payment of {{2}} for {{3}} didn't go through.\n\n" +
      'This could be a temporary issue. Please complete your payment here:\n{{4}}\n\n' +
      'Thank you for being a valued customer! 🙏',
    bodySampleValues: ['Rahul', '₹2,500', 'Acme SaaS', 'https://pay.fynback.com/abc123'],
  },
  {
    name: 'fynback_payment_failed_urgent_v1',
    displayName: 'FynBack Payment Failed - Urgent',
    body:
      'Hi {{1}}, your payment of {{2}} for {{3}} is still pending and your ' +
      'subscription is at risk of being cancelled.\n\n' +
      'Please update your payment now:\n{{4}}\n\n' +
      'Need help? Just reply to this message.',
    bodySampleValues: ['Rahul', '₹2,500', 'Acme SaaS', 'https://pay.fynback.com/abc123'],
  },
  {
    name: 'fynback_payment_failed_final_v1',
    displayName: 'FynBack Payment Failed - Final Notice',
    body:
      "Hi {{1}}, this is our final reminder — your payment of {{2}} for {{3}} is overdue.\n\n" +
      'Complete your payment here: {{4}}\n\n' +
      "OR reply *PAUSE* if you'd like to pause your subscription instead.",
    bodySampleValues: ['Rahul', '₹2,500', 'Acme SaaS', 'https://pay.fynback.com/abc123'],
  },
  {
    name: 'fynback_payment_recovered_v1',
    displayName: 'FynBack Payment Recovered - Confirmation',
    body:
      'Hi {{1}}, great news! ✅\n\n' +
      'Your payment of {{2}} for {{3}} has been received successfully. ' +
      'Your subscription is fully active.\n\nThank you!',
    bodySampleValues: ['Rahul', '₹2,500', 'Acme SaaS'],
  },
] as const;

const INTERAKT_TEMPLATE_NAMES = [
  'fynback_payment_failed_soft_v1',
  'fynback_payment_failed_urgent_v1',
  'fynback_payment_failed_final_v1',
  'fynback_payment_recovered_v1',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Shared Interakt helpers (inlined to avoid importing worker package from web)
// We can't import from apps/worker in apps/web — that would create a circular
// dependency in Turborepo. These helpers are intentionally kept lean.
// ─────────────────────────────────────────────────────────────────────────────

const INTERAKT_BASE = 'https://api.interakt.ai/v1/public';

function authHeader(apiKey: string): string {
  return `Basic ${apiKey}`;
}

async function listTemplates(apiKey: string, templateName?: string) {
  const params = new URLSearchParams({ offset: '0', language: 'all' });
  if (templateName) params.set('template_name', templateName);

  const res = await fetch(
    `${INTERAKT_BASE}/track/organization/templates?${params.toString()}`,
    { headers: { Authorization: authHeader(apiKey), 'Content-Type': 'application/json' } },
  );
  if (!res.ok) throw new Error(`Interakt list templates: ${res.status}`);

  const json = await res.json() as {
    results?: { templates?: Array<{ name: string; approval_status: string; category: string }> };
  };
  return json.results?.templates ?? [];
}

async function createTemplate(apiKey: string, def: typeof FYNBACK_TEMPLATE_DEFS[number]) {
  const payload = {
    display_name: def.displayName,
    language: 'English',
    category: 'Utility',
    header_format: null,
    body: def.body,
    body_text: def.bodySampleValues,
    footer: 'Reply STOP to opt out.',
  };

  const res = await fetch(`${INTERAKT_BASE}/track/templates/`, {
    method: 'POST',
    headers: { Authorization: authHeader(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await res.json() as { data?: { id?: string; name?: string }; message?: string };

  if (!res.ok) {
    throw new Error(json.message ?? `Interakt create template: ${res.status}`);
  }
  return json.data?.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: load Interakt API key for the authenticated merchant from DB
// ─────────────────────────────────────────────────────────────────────────────

async function loadInteraktApiKey(clerkUserId: string): Promise<string | null> {
  const rows = await db
    .select({ encryptedKey: merchantBrandSettings.interaktApiKeyEncrypted })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .innerJoin(
      merchantBrandSettings,
      eq(merchantBrandSettings.merchantId, memberships.merchantId),
    )
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  const encrypted = rows[0]?.encryptedKey;
  if (!encrypted) return null;

  const decrypted = decrypt(encrypted).trim();
  return decrypted || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — Check template approval status
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  let apiKey: string | null;
  try {
    apiKey = await loadInteraktApiKey(userId);
  } catch (err) {
    console.error('[whatsapp-templates GET] DB error loading API key:', err);
    return NextResponse.json({ error: 'Failed to load Interakt configuration' }, { status: 500 });
  }

  if (!apiKey) {
    return NextResponse.json({ error: 'No Interakt API key configured' }, { status: 400 });
  }

  try {
    const all = await listTemplates(apiKey);

    const templateNames = INTERAKT_TEMPLATE_NAMES;
    const statusMap = Object.fromEntries(
      templateNames.map((name) => {
        const found = all.find((t) => t.name === name);
        return [
          name,
          {
            exists: !!found,
            approvalStatus: found?.approval_status ?? 'NOT_CREATED',
            category: found?.category ?? null,
            /**
             * recategorised = Interakt found it but category is not UTILITY.
             * Meta recategorises Utility→Marketing silently.
             * This is a critical alert: costs 5-6x more, 50-70% delivery rate.
             */
            recategorised: found ? found.category !== 'UTILITY' : false,
          },
        ];
      }),
    );

    const allApproved = Object.values(statusMap).every(
      (s) => s.approvalStatus === 'APPROVED',
    );
    const anyRecategorised = Object.values(statusMap).some((s) => s.recategorised);
    const anyWaiting = Object.values(statusMap).some(
      (s) => s.approvalStatus === 'WAITING',
    );
    const anyNotCreated = Object.values(statusMap).some((s) => !s.exists);

    return NextResponse.json({
      templates: statusMap,
      summary: {
        allApproved,
        anyRecategorised,
        anyWaiting,
        anyNotCreated,
        readyToSend: allApproved && !anyRecategorised,
      },
    });
  } catch (err) {
    console.error('[whatsapp-templates GET]', err);
    return NextResponse.json(
      { error: 'Failed to fetch templates from Interakt' },
      { status: 502 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — Provision FynBack templates
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(_req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  // API key always loaded from DB (multi-tenant safe — never from request body)
  let apiKey: string | null;
  try {
    apiKey = await loadInteraktApiKey(userId);
  } catch (err) {
    console.error('[whatsapp-templates POST] DB error loading API key:', err);
    return NextResponse.json({ error: 'Failed to load Interakt configuration' }, { status: 500 });
  }

  if (!apiKey) {
    return NextResponse.json({ error: 'No Interakt API key configured' }, { status: 400 });
  }

  // Check which templates already exist
  let existingNames: Set<string>;
  try {
    const existing = await listTemplates(apiKey);
    existingNames = new Set(existing.map((t) => t.name));
  } catch {
    existingNames = new Set();
  }

  const results: Array<{
    name: string;
    displayName: string;
    status: 'created' | 'already_exists' | 'error';
    error?: string;
  }> = [];

  for (const def of FYNBACK_TEMPLATE_DEFS) {
    if (existingNames.has(def.name)) {
      results.push({ name: def.name, displayName: def.displayName, status: 'already_exists' });
      continue;
    }

    try {
      await createTemplate(apiKey, def);
      results.push({ name: def.name, displayName: def.displayName, status: 'created' });
    } catch (err) {
      results.push({
        name: def.name,
        displayName: def.displayName,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const created = results.filter((r) => r.status === 'created').length;
  const alreadyExisted = results.filter((r) => r.status === 'already_exists').length;
  const failed = results.filter((r) => r.status === 'error').length;

  return NextResponse.json({
    results,
    summary: {
      created,
      alreadyExisted,
      failed,
      message:
        created > 0
          ? `${created} template(s) submitted to Meta for approval. Approval usually takes 24–72 hours.`
          : alreadyExisted === FYNBACK_TEMPLATE_DEFS.length
          ? 'All templates already exist in your Interakt account.'
          : 'Template provisioning completed.',
    },
  });
}
