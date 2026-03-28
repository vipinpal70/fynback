/**
 * GET   /api/dashboard/campaigns/[templateId]/steps/[stepId]/messages
 *   Returns all message templates for a step (email + whatsapp + sms).
 *
 * PUT   /api/dashboard/campaigns/[templateId]/steps/[stepId]/messages
 *   Upserts a message template for a specific channel.
 *   Body: { channel, subject?, bodyHtml?, bodyText, variables? }
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';
import {
  createDb,
  campaignQueries,
  campaignTemplates,
  campaignSteps,
  messageTemplates,
  eq,
  and,
} from '@fynback/db';

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return createDb(url);
}

type Params = { params: Promise<{ templateId: string; stepId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { templateId, stepId } = await params;

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    const db = getDb();

    // Verify the step belongs to a template this merchant can access
    const stepRows = await db
      .select({ id: campaignSteps.id })
      .from(campaignSteps)
      .innerJoin(campaignTemplates, eq(campaignTemplates.id, campaignSteps.campaignTemplateId))
      .where(
        and(
          eq(campaignSteps.id, stepId),
          eq(campaignSteps.campaignTemplateId, templateId)
        )
      )
      .limit(1);

    if (!stepRows[0]) return NextResponse.json({ error: 'Step not found' }, { status: 404 });

    const messages = await campaignQueries.getMessageTemplatesForStep(db, stepId);
    return NextResponse.json({ messages });
  } catch (err) {
    console.error('[API] GET messages error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { templateId, stepId } = await params;

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    const db = getDb();

    // Verify ownership — must be merchant_master template owned by this merchant
    const templateRows = await db
      .select({ merchantId: campaignTemplates.merchantId, type: campaignTemplates.type })
      .from(campaignTemplates)
      .where(
        and(eq(campaignTemplates.id, templateId), eq(campaignTemplates.merchantId, merchantId))
      )
      .limit(1);

    if (!templateRows[0]) {
      return NextResponse.json({ error: 'Template not found or not editable' }, { status: 404 });
    }
    if (templateRows[0].type !== 'merchant_master') {
      return NextResponse.json({ error: 'Cannot edit system default templates' }, { status: 403 });
    }

    const body = await req.json();
    const { channel, subject, bodyHtml, bodyText, variables, isAiGenerated } = body;

    const validChannels = ['email', 'whatsapp', 'sms'];
    if (!channel || !validChannels.includes(channel)) {
      return NextResponse.json({ error: 'channel must be email, whatsapp, or sms' }, { status: 400 });
    }
    if (!bodyText) {
      return NextResponse.json({ error: 'bodyText is required' }, { status: 400 });
    }

    const [msg] = await db
      .insert(messageTemplates)
      .values({
        campaignStepId: stepId,
        channel,
        subject: subject ?? null,
        bodyHtml: bodyHtml ?? null,
        bodyText,
        variables: variables ?? [],
        isAiGenerated: isAiGenerated ?? false,
      })
      .onConflictDoUpdate({
        target: [messageTemplates.campaignStepId, messageTemplates.channel],
        set: {
          subject: subject ?? null,
          bodyHtml: bodyHtml ?? null,
          bodyText,
          variables: variables ?? [],
          isAiGenerated: isAiGenerated ?? false,
          updatedAt: new Date(),
        },
      })
      .returning();

    return NextResponse.json({ message: msg });
  } catch (err) {
    console.error('[API] PUT messages error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
