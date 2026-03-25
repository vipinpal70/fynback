/**
 * GET /api/dashboard/gateways
 *
 * Returns active gateway connection statuses for the merchant.
 * Redis-cached for 10 minutes.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getGatewayStatuses } from '@/lib/cache/dashboard';
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

    const gateways = await getGatewayStatuses(merchantId);
    return NextResponse.json(gateways, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  } catch (err) {
    console.error('[API] /api/dashboard/gateways error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
