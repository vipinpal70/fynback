/**
 * PATCH /api/dashboard/campaigns/settings
 *
 * Toggles merchant-level campaign settings.
 * Currently supports: { campaignsPaused: boolean }
 *
 * Growth/Scale only — trial/starter cannot pause campaigns because they
 * have no control over the system default anyway.
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';
import { createDb, merchants, eq } from '@fynback/db';

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return createDb(url);
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    const db = getDb();

    const merchantRows = await db
      .select({ plan: merchants.plan, campaignsPaused: merchants.campaignsPaused })
      .from(merchants)
      .where(eq(merchants.id, merchantId))
      .limit(1);

    const merchant = merchantRows[0];
    if (!merchant) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    // Only growth+ can control campaign pause
    const canControl = merchant.plan === 'growth' || merchant.plan === 'scale';
    if (!canControl) {
      return NextResponse.json(
        { error: 'Campaign control requires Growth plan or higher' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { campaignsPaused } = body;

    if (typeof campaignsPaused !== 'boolean') {
      return NextResponse.json({ error: 'campaignsPaused must be a boolean' }, { status: 400 });
    }

    await db
      .update(merchants)
      .set({ campaignsPaused, updatedAt: new Date() })
      .where(eq(merchants.id, merchantId));

    return NextResponse.json({ campaignsPaused });
  } catch (err) {
    console.error('[API] PATCH /api/dashboard/campaigns/settings error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
