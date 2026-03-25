/**
 * GET /api/dashboard/kpis
 *
 * Returns live KPI numbers for the dashboard header cards.
 * Redis-cached for 5 minutes. Falls back to DB on cache miss.
 *
 * WHY API ROUTE (not server action)?
 * The dashboard page is "use client" with useEffect fetching.
 * API routes work cleanly with client-side fetch and support proper
 * HTTP caching headers for CDN-level caching in production.
 *
 * WHY NOT pass merchantId in URL?
 * We derive it from the Clerk session server-side — never trust client-supplied IDs.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getDashboardKpis } from '@/lib/cache/dashboard';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) {
      return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
    }

    const kpis = await getDashboardKpis(merchantId);
    return NextResponse.json(kpis, {
      headers: {
        // Allow the browser to cache for 30s — balances freshness vs requests
        'Cache-Control': 'private, max-age=30',
      },
    });
  } catch (err) {
    console.error('[API] /api/dashboard/kpis error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
