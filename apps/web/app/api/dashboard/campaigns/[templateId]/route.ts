/**
 * GET    /api/dashboard/campaigns/[templateId]  — get template with steps + messages
 * PATCH  /api/dashboard/campaigns/[templateId]  — update template name/description/status
 * DELETE /api/dashboard/campaigns/[templateId]  — deactivate a merchant master campaign
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';
import { createDb, campaignQueries, campaignTemplates, merchants, eq, and } from '@fynback/db';

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return createDb(url);
}

type Params = { params: Promise<{ templateId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { templateId } = await params;

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    const db = getDb();
    const [result, merchantRows] = await Promise.all([
      campaignQueries.getCampaignTemplateWithSteps(db, templateId),
      db.select({ plan: merchants.plan, companyName: merchants.companyName })
        .from(merchants).where(eq(merchants.id, merchantId)).limit(1),
    ]);

    if (!result) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

    // Guard: only let merchants view their own templates (system defaults are always viewable)
    if (result.template.merchantId && result.template.merchantId !== merchantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Reshape: embed steps inside template for the editor page
    return NextResponse.json({
      template: { ...result.template, steps: result.steps },
      merchant: merchantRows[0] ?? null,
    });
  } catch (err) {
    console.error('[API] GET /api/dashboard/campaigns/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { templateId } = await params;

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    const db = getDb();

    // Verify ownership — can only edit merchant_master templates
    const existing = await db
      .select({ merchantId: campaignTemplates.merchantId, type: campaignTemplates.type })
      .from(campaignTemplates)
      .where(
        and(eq(campaignTemplates.id, templateId), eq(campaignTemplates.merchantId, merchantId))
      )
      .limit(1);

    if (!existing[0]) {
      return NextResponse.json({ error: 'Template not found or not yours to edit' }, { status: 404 });
    }
    if (existing[0].type !== 'merchant_master') {
      return NextResponse.json({ error: 'Cannot edit system default templates' }, { status: 403 });
    }

    const body = await req.json();
    const { name, description, isActive, isPaused, pauseOfferStep } = body;

    const update: Partial<typeof campaignTemplates.$inferInsert> = { updatedAt: new Date() };
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (isActive !== undefined) update.isActive = isActive;
    if (isPaused !== undefined) update.isPaused = isPaused;
    if (pauseOfferStep !== undefined) update.pauseOfferStep = pauseOfferStep;

    const [updated] = await db
      .update(campaignTemplates)
      .set(update)
      .where(eq(campaignTemplates.id, templateId))
      .returning();

    return NextResponse.json({ template: updated });
  } catch (err) {
    console.error('[API] PATCH /api/dashboard/campaigns/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { templateId } = await params;

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    const db = getDb();

    // Soft delete — set isActive = false (preserve history for active runs)
    const [updated] = await db
      .update(campaignTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(campaignTemplates.id, templateId),
          eq(campaignTemplates.merchantId, merchantId)
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Template not found or not yours' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API] DELETE /api/dashboard/campaigns/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
