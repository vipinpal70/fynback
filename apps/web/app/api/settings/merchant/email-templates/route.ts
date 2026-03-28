/**
 * GET  /api/settings/merchant/email-templates
 *   Returns the campaign steps + email messages for the active template
 *   (merchant override if exists, otherwise system default for their plan).
 *
 * POST /api/settings/merchant/email-templates
 *   Saves customized email subject + bodyText per step.
 *   Creates a merchant_master fork of the system default on first save.
 *   Body: { overrides: [{ stepNumber: number, subject: string, bodyText: string }] }
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';
import {
  createDb,
  merchants,
  campaignTemplates,
  campaignSteps,
  messageTemplates,
  eq,
  and,
  isNull,
  inArray,
} from '@fynback/db';

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return createDb(url);
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    const db = getDb();

    const [merchantRow] = await db
      .select({ plan: merchants.plan })
      .from(merchants)
      .where(eq(merchants.id, merchantId))
      .limit(1);
    const plan = merchantRow?.plan ?? 'trial';

    // Prefer merchant override (email_customization description) over system default
    const [merchantOverride] = await db
      .select({ id: campaignTemplates.id })
      .from(campaignTemplates)
      .where(
        and(
          eq(campaignTemplates.merchantId, merchantId),
          eq(campaignTemplates.type, 'merchant_master'),
          eq(campaignTemplates.isActive, true),
        )
      )
      .limit(1);

    // Fall back to system default for this plan
    let templateId: string | null = merchantOverride?.id ?? null;
    let isOverride = !!merchantOverride;

    if (!templateId) {
      const [sysDefault] = await db
        .select({ id: campaignTemplates.id })
        .from(campaignTemplates)
        .where(
          and(
            isNull(campaignTemplates.merchantId),
            eq(campaignTemplates.planRequired, plan),
            eq(campaignTemplates.isActive, true)
          )
        )
        .limit(1);
      templateId = sysDefault?.id ?? null;
    }

    if (!templateId) {
      return NextResponse.json({ plan, steps: [], merchantOverrideId: null });
    }

    const steps = await db
      .select()
      .from(campaignSteps)
      .where(eq(campaignSteps.campaignTemplateId, templateId))
      .orderBy(campaignSteps.stepNumber);

    const stepIds = steps.map((s) => s.id);
    const msgs = stepIds.length
      ? await db.select().from(messageTemplates).where(inArray(messageTemplates.campaignStepId, stepIds))
      : [];

    const stepsWithMessages = steps.map((step) => ({
      id: step.id,
      stepNumber: step.stepNumber,
      dayOffset: step.dayOffset,
      preferredChannel: step.preferredChannel,
      isPauseOffer: step.isPauseOffer,
      messages: {
        email:    msgs.find((m) => m.campaignStepId === step.id && m.channel === 'email')    ?? null,
        whatsapp: msgs.find((m) => m.campaignStepId === step.id && m.channel === 'whatsapp') ?? null,
        sms:      msgs.find((m) => m.campaignStepId === step.id && m.channel === 'sms')      ?? null,
      },
    }));

    return NextResponse.json({
      plan,
      steps: stepsWithMessages,
      merchantOverrideId: merchantOverride?.id ?? null,
      isOverride,
    });
  } catch (err) {
    console.error('[API] GET /api/settings/merchant/email-templates error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    const body = await req.json();
    const overrides = body.overrides as Array<{ stepNumber: number; subject: string; bodyText: string }>;

    if (!Array.isArray(overrides) || overrides.length === 0) {
      return NextResponse.json({ error: 'overrides array required' }, { status: 400 });
    }

    const db = getDb();

    const [merchantRow] = await db
      .select({ plan: merchants.plan })
      .from(merchants)
      .where(eq(merchants.id, merchantId))
      .limit(1);
    const plan = merchantRow?.plan ?? 'trial';

    // Find existing merchant override template (identified by description)
    const [existingOverride] = await db
      .select({ id: campaignTemplates.id })
      .from(campaignTemplates)
      .where(
        and(
          eq(campaignTemplates.merchantId, merchantId),
          eq(campaignTemplates.type, 'merchant_master'),
          eq(campaignTemplates.isActive, true),
        )
      )
      .limit(1);

    let overrideTemplateId = existingOverride?.id ?? null;

    if (!overrideTemplateId) {
      // Fork the system default: create a merchant_master copy
      const [sysDefault] = await db
        .select()
        .from(campaignTemplates)
        .where(
          and(
            isNull(campaignTemplates.merchantId),
            eq(campaignTemplates.planRequired, plan),
            eq(campaignTemplates.isActive, true)
          )
        )
        .limit(1);

      if (!sysDefault) {
        return NextResponse.json(
          { error: 'System default template not found — run pnpm seed first' },
          { status: 500 }
        );
      }

      const [newTemplate] = await db
        .insert(campaignTemplates)
        .values({
          merchantId,
          name: sysDefault.name,
          description: 'email_customization',
          type: 'merchant_master',
          planRequired: plan,
          declineCategoryFilter: null,
          isActive: true,
          isPaused: false,
          maxSteps: sysDefault.maxSteps,
          pauseOfferStep: sysDefault.pauseOfferStep,
        })
        .returning({ id: campaignTemplates.id });

      overrideTemplateId = newTemplate.id;

      // Clone steps from system default
      const sysSteps = await db
        .select()
        .from(campaignSteps)
        .where(eq(campaignSteps.campaignTemplateId, sysDefault.id))
        .orderBy(campaignSteps.stepNumber);

      // Map old stepId → new stepId
      const stepNumberToNewId: Record<number, string> = {};
      for (const s of sysSteps) {
        const [newStep] = await db
          .insert(campaignSteps)
          .values({
            campaignTemplateId: overrideTemplateId,
            stepNumber: s.stepNumber,
            dayOffset: s.dayOffset,
            preferredChannel: s.preferredChannel,
            isPauseOffer: s.isPauseOffer,
          })
          .returning({ id: campaignSteps.id });
        stepNumberToNewId[s.stepNumber] = newStep.id;
      }

      // Clone whatsapp + sms messages from system default (keep email to be replaced below)
      const sysMessages = sysSteps.length
        ? await db.select().from(messageTemplates)
            .where(inArray(messageTemplates.campaignStepId, sysSteps.map((s) => s.id)))
        : [];

      const oldStepNumberMap: Record<string, number> = {};
      for (const s of sysSteps) oldStepNumberMap[s.id] = s.stepNumber;

      for (const msg of sysMessages) {
        if (msg.channel === 'email') continue; // will be overridden below
        const num = oldStepNumberMap[msg.campaignStepId];
        const newStepId = num !== undefined ? stepNumberToNewId[num] : null;
        if (!newStepId) continue;
        await db.insert(messageTemplates).values({
          campaignStepId: newStepId,
          channel: msg.channel,
          subject: msg.subject,
          bodyHtml: msg.bodyHtml,
          bodyText: msg.bodyText,
          variables: msg.variables ?? [],
          isAiGenerated: false,
        }).onConflictDoNothing();
      }

      // Save the email overrides to new steps
      for (const override of overrides) {
        const newStepId = stepNumberToNewId[override.stepNumber];
        if (!newStepId) continue;
        await db.insert(messageTemplates).values({
          campaignStepId: newStepId,
          channel: 'email',
          subject: override.subject,
          bodyHtml: null,
          bodyText: override.bodyText,
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link', 'product_name'],
          isAiGenerated: false,
        }).onConflictDoUpdate({
          target: [messageTemplates.campaignStepId, messageTemplates.channel],
          set: { subject: override.subject, bodyText: override.bodyText, bodyHtml: null, updatedAt: new Date() },
        });
      }
    } else {
      // Already have an override template — update email messages by step number
      const overrideSteps = await db
        .select({ id: campaignSteps.id, stepNumber: campaignSteps.stepNumber })
        .from(campaignSteps)
        .where(eq(campaignSteps.campaignTemplateId, overrideTemplateId));

      const stepNumberToId: Record<number, string> = {};
      for (const s of overrideSteps) stepNumberToId[s.stepNumber] = s.id;

      for (const override of overrides) {
        const stepId = stepNumberToId[override.stepNumber];
        if (!stepId) continue;
        await db.insert(messageTemplates).values({
          campaignStepId: stepId,
          channel: 'email',
          subject: override.subject,
          bodyHtml: null,
          bodyText: override.bodyText,
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link', 'product_name'],
          isAiGenerated: false,
        }).onConflictDoUpdate({
          target: [messageTemplates.campaignStepId, messageTemplates.channel],
          set: { subject: override.subject, bodyText: override.bodyText, bodyHtml: null, updatedAt: new Date() },
        });
      }
    }

    return NextResponse.json({ success: true, templateId: overrideTemplateId });
  } catch (err) {
    console.error('[API] POST /api/settings/merchant/email-templates error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
