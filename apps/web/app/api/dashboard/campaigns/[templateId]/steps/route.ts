/**
 * POST /api/dashboard/campaigns/[templateId]/steps
 * Adds a new step to a merchant master campaign template.
 *
 * Body: { stepNumber, dayOffset, preferredChannel, isPauseOffer }
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';
import {
  createDb,
  campaignTemplates,
  campaignSteps,
  eq,
  and,
} from '@fynback/db';

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return createDb(url);
}

type Params = { params: Promise<{ templateId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { templateId } = await params;

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    const db = getDb();

    // Verify ownership + get maxSteps
    const templateRows = await db
      .select({
        merchantId: campaignTemplates.merchantId,
        type: campaignTemplates.type,
        maxSteps: campaignTemplates.maxSteps,
      })
      .from(campaignTemplates)
      .where(
        and(eq(campaignTemplates.id, templateId), eq(campaignTemplates.merchantId, merchantId))
      )
      .limit(1);

    const template = templateRows[0];
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    if (template.type !== 'merchant_master') {
      return NextResponse.json({ error: 'Cannot edit system default templates' }, { status: 403 });
    }

    // Check step count limit
    const existingSteps = await db
      .select({ id: campaignSteps.id })
      .from(campaignSteps)
      .where(eq(campaignSteps.campaignTemplateId, templateId));

    if (existingSteps.length >= template.maxSteps) {
      return NextResponse.json(
        { error: `Your plan allows a maximum of ${template.maxSteps} steps` },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { stepNumber, dayOffset, preferredChannel, isPauseOffer } = body;

    if (!stepNumber || dayOffset === undefined || !preferredChannel) {
      return NextResponse.json({ error: 'stepNumber, dayOffset, and preferredChannel are required' }, { status: 400 });
    }

    const validChannels = ['email', 'whatsapp', 'sms'];
    if (!validChannels.includes(preferredChannel)) {
      return NextResponse.json({ error: 'preferredChannel must be email, whatsapp, or sms' }, { status: 400 });
    }

    const [step] = await db
      .insert(campaignSteps)
      .values({
        campaignTemplateId: templateId,
        stepNumber,
        dayOffset,
        preferredChannel,
        isPauseOffer: isPauseOffer ?? false,
      })
      .onConflictDoNothing()
      .returning();

    if (!step) {
      return NextResponse.json({ error: 'Step number already exists in this template' }, { status: 409 });
    }

    return NextResponse.json({ step }, { status: 201 });
  } catch (err) {
    console.error('[API] POST /api/dashboard/campaigns/[id]/steps error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
