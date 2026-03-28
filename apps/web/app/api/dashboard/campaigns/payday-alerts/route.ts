/**
 * GET /api/dashboard/campaigns/payday-alerts
 *
 * Returns exhausted campaign runs that haven't received a payday notification yet.
 * Used by the dashboard to show the "Retry on payday" notification badge.
 * Shown only to Growth+ plan merchants.
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';
import {
  createDb,
  campaignQueries,
  merchants,
  failedPayments,
  campaignRuns,
  eq,
} from '@fynback/db';

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return createDb(url);
}

export async function GET(_req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    const db = getDb();

    // Only Growth+ plans get payday alerts
    const merchantRows = await db
      .select({ plan: merchants.plan })
      .from(merchants)
      .where(eq(merchants.id, merchantId))
      .limit(1);

    const plan = merchantRows[0]?.plan;
    if (plan !== 'growth' && plan !== 'scale') {
      return NextResponse.json({ alerts: [] });
    }

    const exhaustedRuns = await campaignQueries.getExhaustedRunsAwaitingPaydayNotification(
      db,
      merchantId
    );

    if (exhaustedRuns.length === 0) {
      return NextResponse.json({ alerts: [] });
    }

    // Enrich with payment info for display
    const enriched = await Promise.all(
      exhaustedRuns.map(async (run) => {
        const fpRows = await db
          .select({
            customerName: failedPayments.customerName,
            customerEmail: failedPayments.customerEmail,
            amountPaise: failedPayments.amountPaise,
            currency: failedPayments.currency,
          })
          .from(failedPayments)
          .where(eq(failedPayments.id, run.failedPaymentId))
          .limit(1);

        return {
          campaignRunId: run.id,
          failedPaymentId: run.failedPaymentId,
          ...fpRows[0],
          exhaustedAt: run.completedAt,
        };
      })
    );

    return NextResponse.json({
      alerts: enriched,
      count: enriched.length,
    });
  } catch (err) {
    console.error('[API] GET payday-alerts error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
