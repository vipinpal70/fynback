/**
 * POST /api/webhooks/interakt
 *
 * Handles ALL Interakt webhook events:
 *   1. Delivery status callbacks (sent, delivered, read/opened, failed)
 *   2. Inbound customer replies ("PAUSE" → trigger pause flow, "STOP" → opt-out)
 *
 * SETUP IN INTERAKT:
 *   Interakt > Settings > Developer Settings > Webhook URL
 *   Set to: https://app.fynback.com/api/webhooks/interakt
 *
 * SECURITY:
 * Interakt doesn't HMAC-sign payloads. We validate by looking up the message ID
 * in our outreach_events table — unknown IDs are acknowledged and ignored.
 * UUIDs are unguessable so this is sufficient.
 *
 * PAYLOAD STRUCTURE (from Interakt docs):
 *
 * Delivery event:
 *   { id, status: "sent"|"delivered"|"read"|"failed", callbackData, phoneNumber,
 *     error?: { code, message }, timestamp }
 *
 * Inbound message (customer replied):
 *   { type: "message", phoneNumber, message: { type: "text", text: "PAUSE" } }
 *
 * callbackData format set at send time:
 *   "campaign_run:{runId}:step:{stepNumber}"  — dunning message
 *   "recovery_confirmed"                       — recovery confirmation
 */

import { NextRequest, NextResponse } from 'next/server';
import { createDb, outreachEvents, eq } from '@fynback/db';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface InteraktDeliveryEvent {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  callbackData?: string;
  phoneNumber?: string;
  error?: { code?: string; message?: string };
  timestamp?: string;
}

interface InteraktInboundEvent {
  type: 'message';
  phoneNumber?: string;
  message?: {
    type?: 'text' | 'image' | 'audio' | 'video' | 'document' | 'button';
    text?: string;
    /** For button replies (quick-reply templates) */
    button?: { payload?: string; text?: string };
  };
  /** callbackData from the last outbound message (useful for context) */
  callbackData?: string;
}

type InteraktPayload = Partial<InteraktDeliveryEvent & InteraktInboundEvent>;

const db = createDb(process.env.DATABASE_URL!);

// ─────────────────────────────────────────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let payload: InteraktPayload;
  try {
    payload = await req.json() as InteraktPayload;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  // Structured log (production: pipe to Axiom/Datadog)
  console.log('[Interakt Webhook]', JSON.stringify(payload));

  // ── Route: inbound customer reply ──────────────────────────────────────────
  if (payload.type === 'message' && payload.message) {
    await handleInboundMessage(payload as InteraktInboundEvent);
    return NextResponse.json({ ok: true });
  }

  // ── Route: delivery status update ──────────────────────────────────────────
  if (payload.id && payload.status) {
    await handleDeliveryStatus(payload as InteraktDeliveryEvent);
    return NextResponse.json({ ok: true });
  }

  // Unknown shape — acknowledge so Interakt doesn't retry
  return NextResponse.json({ ok: true });
}

// Interakt pings GET to verify webhook URL is reachable
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, service: 'fynback-interakt-webhook' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler: delivery status
// ─────────────────────────────────────────────────────────────────────────────

async function handleDeliveryStatus(event: InteraktDeliveryEvent): Promise<void> {
  // Map Interakt status → our DB enum
  // DB enum: 'pending' | 'sent' | 'delivered' | 'failed' | 'opened' | 'clicked'
  // Interakt:                      'sent'  'delivered'  'read'    'failed'
  const statusMap: Record<string, 'sent' | 'delivered' | 'opened' | 'failed'> = {
    sent:      'sent',
    delivered: 'delivered',
    read:      'opened',   // WhatsApp blue ticks = "opened" in our schema
    failed:    'failed',
  };

  const outreachStatus = statusMap[event.status];
  if (!outreachStatus) return;

  try {
    const rows = await db
      .select({ id: outreachEvents.id, currentStatus: outreachEvents.status })
      .from(outreachEvents)
      .where(eq(outreachEvents.providerMessageId, event.id))
      .limit(1);

    if (rows.length === 0) {
      // recovery_confirmed messages or other unknown IDs — not stored in outreach_events
      console.log(`[Interakt] No outreach_event for message ${event.id} — skipping`);
      return;
    }

    const row = rows[0];

    // Never go backwards (handles out-of-order callbacks)
    const priority: Record<string, number> = {
      pending: 0, sent: 1, delivered: 2, opened: 3, clicked: 4,
      failed: -1,  // 'failed' is a separate terminal state — always allow it
    };
    const currentP = priority[row.currentStatus] ?? 0;
    const newP = priority[outreachStatus] ?? 0;

    if (outreachStatus !== 'failed' && newP <= currentP) return;

    const now = new Date();
    const updates: Record<string, unknown> = { status: outreachStatus };

    if (outreachStatus === 'delivered') updates.deliveredAt = now;
    if (outreachStatus === 'opened')    updates.openedAt = now;
    if (outreachStatus === 'failed') {
      updates.failedAt = now;
      updates.errorMessage = event.error?.message ?? event.error?.code ?? 'delivery_failed';
    }

    await db.update(outreachEvents).set(updates).where(eq(outreachEvents.id, row.id));

    console.log(`[Interakt] outreach_event ${row.id}: ${row.currentStatus} → ${outreachStatus}`);
  } catch (err) {
    // Return 200 even on DB error — Interakt retries on non-2xx which causes
    // duplicate processing. Log and move on; idempotency guards above handle it.
    console.error(`[Interakt] DB error in handleDeliveryStatus: ${err}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler: inbound customer message
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handles a customer replying to a FynBack WhatsApp message.
 *
 * RECOGNISED INTENTS:
 *   "PAUSE" / "pause" → customer wants to pause subscription
 *     → Log as engagement signal; mark campaign_run.pauseOfferStatus = 'requested'
 *     → Notify merchant via dashboard notification to approve/reject the pause
 *
 *   "STOP" / "stop" / "unsubscribe" → opt-out from WhatsApp messages
 *     → Interakt handles STOP automatically (removes from WhatsApp sends)
 *     → We log it so FynBack knows not to send more WhatsApp to this number
 *
 *   Anything else → positive engagement signal (customer is aware)
 *     → Mark the most recent outreach_event.openedAt (if not already set)
 *     → This helps attribution: if they reply, they clearly saw the message
 *
 * The callbackData from the LAST outbound message is echoed back in inbound
 * events, so we know which campaign run the customer is responding to.
 */
async function handleInboundMessage(event: InteraktInboundEvent): Promise<void> {
  const messageText = (
    event.message?.text ??
    event.message?.button?.text ??
    ''
  ).trim().toLowerCase();

  const callbackData = event.callbackData ?? '';
  const phone = event.phoneNumber;

  console.log(
    `[Interakt] Inbound from ${phone}: "${messageText}" ` +
    `(context: ${callbackData || 'none'})`
  );

  // ── Parse campaign context from callbackData ──────────────────────────────
  // callbackData format: "campaign_run:{runId}:step:{stepNumber}"
  const campaignRunMatch = callbackData.match(/^campaign_run:([^:]+):step:(\d+)$/);
  const campaignRunId = campaignRunMatch?.[1];

  // ── Intent: PAUSE request ──────────────────────────────────────────────────
  if (messageText === 'pause' && campaignRunId) {
    try {
      const { campaignRuns } = await import('@fynback/db');
      // Mark pause requested — merchant sees this in dashboard and approves/rejects
      // 'pending' = pause offer sent + customer requested it → merchant decides
      await db
        .update(campaignRuns)
        .set({ pauseOfferStatus: 'pending' })
        .where(eq(campaignRuns.id, campaignRunId));

      console.log(`[Interakt] PAUSE requested for campaign run ${campaignRunId}`);
      // Note: merchant notification is handled by the dashboard polling
      // /api/campaigns/payday-alerts — a future enhancement can add real-time push here
    } catch (err) {
      console.error(`[Interakt] Failed to record PAUSE request: ${err}`);
    }
    return;
  }

  // ── Intent: STOP / opt-out ─────────────────────────────────────────────────
  if (['stop', 'unsubscribe', 'optout', 'opt out', 'cancel'].includes(messageText)) {
    // Interakt automatically removes the user from WhatsApp sends on STOP.
    // We just log it — no DB action needed beyond what Interakt does.
    console.log(`[Interakt] STOP intent from ${phone} — Interakt handles opt-out automatically`);
    return;
  }

  // ── Intent: General engagement (any other reply) ───────────────────────────
  // Customer replied = they saw the message. Mark openedAt on the latest outreach
  // event for this campaign run if not already marked (engagement signal).
  if (campaignRunId && phone) {
    try {
      const rows = await db
        .select({ id: outreachEvents.id, openedAt: outreachEvents.openedAt })
        .from(outreachEvents)
        .where(eq(outreachEvents.campaignRunStepId, campaignRunId))
        .limit(1);

      if (rows.length > 0 && !rows[0].openedAt) {
        await db
          .update(outreachEvents)
          .set({ status: 'opened', openedAt: new Date() })
          .where(eq(outreachEvents.id, rows[0].id));

        console.log(`[Interakt] Engagement signal: marked outreach_event ${rows[0].id} as opened (customer replied)`);
      }
    } catch (err) {
      console.error(`[Interakt] Failed to record engagement signal: ${err}`);
    }
  }
}
