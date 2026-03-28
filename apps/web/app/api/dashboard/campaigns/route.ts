/**
 * GET  /api/dashboard/campaigns          — list campaign runs for the merchant (enriched)
 * POST /api/dashboard/campaigns          — create a new merchant master campaign template
 *
 * GET response shape:
 * {
 *   runs: CampaignRun[],      // enriched with customer info + template steps
 *   templates: CampaignTemplate[],  // with steps, for the Templates tab
 *   merchant: { plan, companyName }
 * }
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';
import {
  createDb, campaignQueries, merchants, failedPayments, campaignSteps,
  campaignTemplates as campaignTemplatesTable,
  eq,
} from '@fynback/db';

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return createDb(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET: list campaign runs
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 100);
  const offset = Number(searchParams.get('offset') ?? '0');

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    const db = getDb();

    // Fetch runs + merchant info in parallel
    const [rawRuns, merchantRows, merchantTemplates] = await Promise.all([
      campaignQueries.getMerchantCampaignRuns(db, merchantId, limit, offset),
      db.select({ plan: merchants.plan, companyName: merchants.companyName })
        .from(merchants).where(eq(merchants.id, merchantId)).limit(1),
      campaignQueries.getMerchantCampaignTemplates(db, merchantId),
    ]);

    const merchant = merchantRows[0] ?? null;

    // Enrich runs with payment data and template steps
    const enrichedRuns = await Promise.all(
      rawRuns.map(async (run) => {
        const [fpRows, templateRows, stepsRows] = await Promise.all([
          db.select({
            customerName: failedPayments.customerName,
            customerEmail: failedPayments.customerEmail,
            amountPaise: failedPayments.amountPaise,
            currency: failedPayments.currency,
          }).from(failedPayments).where(eq(failedPayments.id, run.failedPaymentId)).limit(1),
          db.select({ name: campaignTemplatesTable.name })
            .from(campaignTemplatesTable)
            .where(eq(campaignTemplatesTable.id, run.campaignTemplateId))
            .limit(1),
          db.select({
            id: campaignSteps.id,
            stepNumber: campaignSteps.stepNumber,
            dayOffset: campaignSteps.dayOffset,
            preferredChannel: campaignSteps.preferredChannel,
            isPauseOffer: campaignSteps.isPauseOffer,
          }).from(campaignSteps)
            .where(eq(campaignSteps.campaignTemplateId, run.campaignTemplateId))
            .orderBy(campaignSteps.stepNumber),
        ]);

        const fp = fpRows[0];
        return {
          ...run,
          customerName: fp?.customerName ?? null,
          customerEmail: fp?.customerEmail ?? null,
          amountPaise: fp?.amountPaise ?? 0,
          currency: fp?.currency ?? 'INR',
          templateName: templateRows[0]?.name ?? 'Campaign',
          templateSteps: stepsRows,
        };
      })
    );

    // Enrich templates with steps
    const templatesWithSteps = await Promise.all(
      merchantTemplates.map(async (t) => {
        const steps = await db.select({
          id: campaignSteps.id,
          stepNumber: campaignSteps.stepNumber,
          dayOffset: campaignSteps.dayOffset,
          preferredChannel: campaignSteps.preferredChannel,
          isPauseOffer: campaignSteps.isPauseOffer,
        }).from(campaignSteps)
          .where(eq(campaignSteps.campaignTemplateId, t.id))
          .orderBy(campaignSteps.stepNumber);
        return { ...t, steps };
      })
    );

    return NextResponse.json({ runs: enrichedRuns, templates: templatesWithSteps, merchant }, {
      headers: { 'Cache-Control': 'private, max-age=15' },
    });
  } catch (err) {
    console.error('[API] GET /api/dashboard/campaigns error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST: create merchant master campaign template
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    const db = getDb();

    // Get merchant plan to enforce campaign limits
    const merchantRows = await db
      .select({ plan: merchants.plan })
      .from(merchants)
      .where(eq(merchants.id, merchantId))
      .limit(1);

    const plan = merchantRows[0]?.plan ?? 'trial';

    // Enforce plan limits: growth=1, scale=5
    const campaignLimit = plan === 'scale' ? 5 : plan === 'growth' ? 1 : 0;
    if (campaignLimit === 0) {
      return NextResponse.json(
        { error: 'Custom campaigns require Growth plan or higher' },
        { status: 403 }
      );
    }

    const existingCount = await campaignQueries.countMerchantMasterCampaigns(db, merchantId);
    if (existingCount >= campaignLimit) {
      return NextResponse.json(
        { error: `Your plan allows a maximum of ${campaignLimit} custom campaign(s)` },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, description, declineCategoryFilter, pauseOfferStep } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 });
    }

    const maxSteps = plan === 'scale' ? 15 : plan === 'growth' ? 5 : 3;

    const { campaignTemplates } = await import('@fynback/db');
    const [template] = await db
      .insert(campaignTemplates)
      .values({
        merchantId,
        name: name.trim(),
        description: description ?? null,
        type: 'merchant_master',
        planRequired: plan,
        declineCategoryFilter: declineCategoryFilter ?? null,
        isActive: true,
        isPaused: false,
        maxSteps,
        pauseOfferStep: pauseOfferStep ?? null,
      })
      .returning();

    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    console.error('[API] POST /api/dashboard/campaigns error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
