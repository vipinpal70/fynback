/**
 * GET /api/dashboard/payments?limit=10&offset=0
 *
 * Returns recent failed payments for the dashboard table and /payments page.
 * Redis-cached per merchant. Supports pagination via limit/offset query params.
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { getRecentPayments } from '@/lib/cache/dashboard';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100); // cap at 100

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) {
      return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
    }

    const payments = await getRecentPayments(merchantId, limit);
    return NextResponse.json(payments, {
      headers: { 'Cache-Control': 'private, max-age=30' },
    });
  } catch (err) {
    console.error('[API] /api/dashboard/payments error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
