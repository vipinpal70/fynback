/**
 * GET /api/dashboard/analytics?days=30
 *
 * Returns historical analytics snapshots for recovery trend charts.
 * Redis-cached for 1 hour — data updates via daily cron.
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { getAnalyticsHistory } from '@/lib/cache/dashboard';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const days = Math.min(Number(req.nextUrl.searchParams.get('days') ?? '30'), 365);

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) {
      return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
    }

    const history = await getAnalyticsHistory(merchantId, days);
    return NextResponse.json(history, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (err) {
    console.error('[API] /api/dashboard/analytics error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
