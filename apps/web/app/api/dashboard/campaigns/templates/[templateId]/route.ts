/**
 * PATCH /api/dashboard/campaigns/templates/[templateId]
 *
 * Toggles isPaused on a merchant master campaign template.
 * Only the owning merchant can toggle their own templates.
 * System defaults (merchant_id = NULL) cannot be toggled here.
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';
import { createDb, campaignTemplates, eq, and, isNotNull } from '@fynback/db';

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return createDb(url);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    const db = getDb();
    const { templateId } = await params;

    // Verify the template belongs to this merchant (not a system default)
    const rows = await db
      .select({ id: campaignTemplates.id, isPaused: campaignTemplates.isPaused, merchantId: campaignTemplates.merchantId })
      .from(campaignTemplates)
      .where(
        and(
          eq(campaignTemplates.id, templateId),
          eq(campaignTemplates.merchantId, merchantId),
          isNotNull(campaignTemplates.merchantId)
        )
      )
      .limit(1);

    const template = rows[0];
    if (!template) {
      return NextResponse.json({ error: 'Template not found or not editable' }, { status: 404 });
    }

    const body = await req.json();
    const { isPaused } = body;

    if (typeof isPaused !== 'boolean') {
      return NextResponse.json({ error: 'isPaused must be a boolean' }, { status: 400 });
    }

    await db
      .update(campaignTemplates)
      .set({ isPaused, updatedAt: new Date() })
      .where(eq(campaignTemplates.id, templateId));

    return NextResponse.json({ id: templateId, isPaused });
  } catch (err) {
    console.error('[API] PATCH /api/dashboard/campaigns/templates/[templateId] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
