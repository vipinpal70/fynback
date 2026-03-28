/**
 * POST /api/dashboard/campaigns/runs/[runId]/pause-offer
 *
 * Merchant approves or rejects the pause offer for a campaign run.
 * Body: { action: 'approve' | 'reject' }
 *
 * APPROVE: marks campaign run pause_offer_status = 'approved'
 *          The gateway-level subscription pause is the merchant's responsibility
 *          (FynBack notifies; merchant takes action in their gateway dashboard).
 *          Campaign run status is set to 'paused'.
 *
 * REJECT:  marks campaign run pause_offer_status = 'rejected'
 *          Campaign continues to next steps.
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';
import { createDb, campaignQueries, campaignRuns, eq, and } from '@fynback/db';
import { Resend } from 'resend';

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return createDb(url);
}

type Params = { params: Promise<{ runId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { runId } = await params;

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    const db = getDb();

    // Verify this run belongs to the merchant and has a pending pause offer
    const runRows = await db
      .select()
      .from(campaignRuns)
      .where(
        and(eq(campaignRuns.id, runId), eq(campaignRuns.merchantId, merchantId))
      )
      .limit(1);

    const run = runRows[0];
    if (!run) return NextResponse.json({ error: 'Campaign run not found' }, { status: 404 });
    if (!run.pauseOfferSent) {
      return NextResponse.json({ error: 'No pause offer has been sent for this run' }, { status: 400 });
    }
    if (run.pauseOfferStatus !== 'pending') {
      return NextResponse.json(
        { error: `Pause offer already ${run.pauseOfferStatus}` },
        { status: 409 }
      );
    }

    const body = await req.json();
    const { action } = body;

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 });
    }

    const updates: Parameters<typeof campaignQueries.updateCampaignRun>[2] = {
      pauseOfferStatus: action === 'approve' ? 'approved' : 'rejected',
    };

    if (action === 'approve') {
      // Pause the campaign run — no more messages sent until merchant re-activates
      updates.status = 'paused';
      updates.completedAt = new Date();
    }

    await campaignQueries.updateCampaignRun(db, runId, updates);

    // Get failed payment info for the customer notification
    const { failedPayments: fpTable } = await import('@fynback/db');
    const { eq: eqOp } = await import('@fynback/db');
    const fpRows = await db
      .select({
        customerEmail: fpTable.customerEmail,
        customerName: fpTable.customerName,
        amountPaise: fpTable.amountPaise,
        currency: fpTable.currency,
      })
      .from(fpTable)
      .where(eqOp(fpTable.id, run.failedPaymentId))
      .limit(1);

    const fp = fpRows[0];

    // Notify customer of the decision
    if (fp?.customerEmail) {
      const resend = new Resend(process.env.RESEND_API_KEY!);
      const amount = fp.currency === 'INR'
        ? `₹${(fp.amountPaise / 100).toLocaleString('en-IN')}`
        : `${fp.currency} ${(fp.amountPaise / 100).toFixed(2)}`;

      if (action === 'approve') {
        await resend.emails.send({
          from: `Payment Team <recovery@fynback.com>`,
          to: fp.customerEmail,
          subject: 'Your subscription pause has been approved',
          text:
            `Hi ${fp.customerName?.split(' ')[0] ?? 'there'},\n\n` +
            `Your request to pause your subscription has been approved.\n\n` +
            `Your subscription is now paused and you won't be charged until you resume.\n` +
            `The outstanding amount of ${amount} has been waived for now.\n\n` +
            `We hope to see you back soon!`,
        });
      } else {
        await resend.emails.send({
          from: `Payment Team <recovery@fynback.com>`,
          to: fp.customerEmail,
          subject: 'Update on your subscription',
          text:
            `Hi ${fp.customerName?.split(' ')[0] ?? 'there'},\n\n` +
            `We weren't able to approve the pause request at this time.\n\n` +
            `Your subscription is still active and the payment of ${amount} remains due.\n` +
            `Please update your payment method to continue your access.\n\n` +
            `If you have questions, please contact our support team.`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      status: action === 'approve' ? 'paused' : 'active',
      pauseOfferStatus: action === 'approve' ? 'approved' : 'rejected',
    });
  } catch (err) {
    console.error('[API] POST pause-offer error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
