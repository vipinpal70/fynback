/**
 * POST /api/dashboard/campaigns/[templateId]/steps
 * Adds a new step to a merchant master campaign template.
 *
 * Body: { stepNumber, dayOffset, channels, isPauseOffer }
 *
 * Plan gates:
 *   trial / starter → email only (channels must be ['email'])
 *   growth          → up to 2 channels per step
 *   scale           → up to 3 channels per step
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';
import {
  createDb,
  campaignTemplates,
  campaignSteps,
  merchants,
  eq,
  and,
} from '@fynback/db';

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return createDb(url);
}

const VALID_CHANNELS = ['email', 'whatsapp', 'sms'] as const;
type Channel = (typeof VALID_CHANNELS)[number];

// How many channels each plan tier can use per step
const PLAN_CHANNEL_LIMIT: Record<string, number> = {
  trial: 1,
  starter: 1,
  growth: 2,
  scale: 3,
};

type Params = { params: Promise<{ templateId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { templateId } = await params;

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    const db = getDb();

    // Verify ownership + get maxSteps + merchant plan
    const [templateRow] = await db
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

    if (!templateRow) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    if (templateRow.type !== 'merchant_master') {
      return NextResponse.json({ error: 'Cannot edit system default templates' }, { status: 403 });
    }

    // Get merchant's current plan for channel gating
    const [merchantRow] = await db
      .select({ plan: merchants.plan })
      .from(merchants)
      .where(eq(merchants.id, merchantId))
      .limit(1);

    const plan = (merchantRow?.plan ?? 'starter') as string;
    const channelLimit = PLAN_CHANNEL_LIMIT[plan] ?? 1;

    // Check step count limit
    const existingSteps = await db
      .select({ id: campaignSteps.id })
      .from(campaignSteps)
      .where(eq(campaignSteps.campaignTemplateId, templateId));

    if (existingSteps.length >= templateRow.maxSteps) {
      return NextResponse.json(
        { error: `Your plan allows a maximum of ${templateRow.maxSteps} steps` },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { stepNumber, dayOffset, channels, isPauseOffer } = body;

    // Support legacy `preferredChannel` field from old clients
    const rawChannels: Channel[] =
      channels ?? (body.preferredChannel ? [body.preferredChannel] : null);

    if (!stepNumber || dayOffset === undefined || !rawChannels?.length) {
      return NextResponse.json(
        { error: 'stepNumber, dayOffset, and channels are required' },
        { status: 400 }
      );
    }

    // Validate channel values
    const invalidCh = rawChannels.find((c) => !VALID_CHANNELS.includes(c as Channel));
    if (invalidCh) {
      return NextResponse.json(
        { error: `Invalid channel: ${invalidCh}. Must be one of: ${VALID_CHANNELS.join(', ')}` },
        { status: 400 }
      );
    }

    // Deduplicate
    const uniqueChannels = [...new Set(rawChannels)] as Channel[];

    // Plan gate: starter/trial = email only
    if (channelLimit === 1 && (uniqueChannels.length > 1 || !uniqueChannels.includes('email'))) {
      return NextResponse.json(
        { error: 'Your plan only supports email campaigns. Upgrade to Growth to unlock multi-channel.' },
        { status: 403 }
      );
    }

    if (uniqueChannels.length > channelLimit) {
      return NextResponse.json(
        { error: `Your plan allows up to ${channelLimit} channel(s) per step.` },
        { status: 403 }
      );
    }

    // preferredChannel is the first listed channel (primary)
    const preferredChannel = uniqueChannels[0];

    const [step] = await db
      .insert(campaignSteps)
      .values({
        campaignTemplateId: templateId,
        stepNumber,
        dayOffset,
        preferredChannel,
        channels: uniqueChannels,
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
