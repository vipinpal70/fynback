/**
 * POST /api/dashboard/campaigns/[templateId]/steps/[stepId]/messages/generate
 *
 * AI-generates a message template for a step × channel using Claude.
 * Scale plan only.
 *
 * Body: {
 *   channel: 'email' | 'whatsapp' | 'sms'
 *   stepNumber: number
 *   dayOffset: number
 *   isPauseOffer: boolean
 *   isFinalStep: boolean
 *   merchantProductDescription: string  ← what the merchant's product does
 *   declineCategory?: string
 * }
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';
import { createDb, merchants, campaignTemplates, eq, and } from '@fynback/db';
import Anthropic from '@anthropic-ai/sdk';

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return createDb(url);
}

type Params = { params: Promise<{ templateId: string; stepId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { templateId } = await params;

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    const db = getDb();

    // Scale plan only
    const merchantRows = await db
      .select({ plan: merchants.plan, companyName: merchants.companyName })
      .from(merchants)
      .where(eq(merchants.id, merchantId))
      .limit(1);

    const merchant = merchantRows[0];
    if (!merchant || merchant.plan !== 'scale') {
      return NextResponse.json(
        { error: 'AI template generation requires Scale plan' },
        { status: 403 }
      );
    }

    // Verify template ownership
    const templateRows = await db
      .select({ merchantId: campaignTemplates.merchantId })
      .from(campaignTemplates)
      .where(
        and(eq(campaignTemplates.id, templateId), eq(campaignTemplates.merchantId, merchantId))
      )
      .limit(1);

    if (!templateRows[0]) {
      return NextResponse.json({ error: 'Template not found or not yours' }, { status: 404 });
    }

    const body = await req.json();
    const {
      channel,
      stepNumber,
      dayOffset,
      isPauseOffer,
      isFinalStep,
      merchantProductDescription,
      declineCategory,
    } = body;

    if (!channel || !merchantProductDescription) {
      return NextResponse.json({ error: 'channel and merchantProductDescription are required' }, { status: 400 });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const channelConstraints: Record<string, string> = {
      email: 'HTML email with subject line. Use inline styles only (no <style> tags). Keep it concise and mobile-friendly.',
      whatsapp: 'Plain text only. Max 1024 characters. Can use *bold* and emojis sparingly. No HTML.',
      sms: 'Plain text only. Max 160 characters. No emojis. Must start with brand name.',
    };

    const toneGuide =
      isFinalStep
        ? 'urgent but not threatening — serious, clear consequences'
        : isPauseOffer
        ? 'empathetic and helpful — offer a way out with dignity'
        : dayOffset <= 2
        ? 'friendly and informational — no alarm yet'
        : 'firm but respectful — growing urgency';

    const prompt = `You are writing a payment recovery dunning message for a subscription business.

MERCHANT: ${merchant.companyName}
PRODUCT: ${merchantProductDescription}
STEP: ${stepNumber} (Day ${dayOffset} after payment failure)
CHANNEL: ${channel}
TONE: ${toneGuide}
${declineCategory ? `FAILURE REASON: ${declineCategory.replace(/_/g, ' ')}` : ''}
${isPauseOffer ? 'INCLUDE: A pause subscription offer (pause for 1 month, no charge)' : ''}
${isFinalStep ? 'INCLUDE: Warning that subscription will be cancelled in 24 hours and what they will lose' : ''}

CHANNEL CONSTRAINTS: ${channelConstraints[channel]}

TEMPLATE VARIABLES (use exactly as written, they will be substituted at send time):
- {{customer_name}} — customer's first name
- {{amount}} — payment amount (e.g. ₹2,400)
- {{merchant_name}} — the business name
- {{payment_link}} — the payment/checkout page URL
- {{product_name}} — the product/service name
${isPauseOffer ? '- For pause link use: {{payment_link}}?action=pause' : ''}

OUTPUT FORMAT (JSON only, no markdown):
${channel === 'email'
  ? `{
  "subject": "...",
  "bodyHtml": "...",
  "bodyText": "...",
  "variables": ["customer_name", "amount", "merchant_name", "payment_link"]
}`
  : `{
  "bodyText": "...",
  "variables": ["customer_name", "amount", "merchant_name", "payment_link"]
}`}

Generate a single high-converting message. Be specific to the product context. Output only valid JSON.`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse JSON response
    let generated: Record<string, unknown>;
    try {
      // Strip any markdown code fences if present
      const cleaned = rawText.replace(/^```json?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      generated = JSON.parse(cleaned);
    } catch {
      console.error('[AI Generate] Failed to parse AI response:', rawText);
      return NextResponse.json({ error: 'AI returned invalid response — please try again' }, { status: 500 });
    }

    return NextResponse.json({
      generated,
      isAiGenerated: true,
    });
  } catch (err) {
    console.error('[API] POST generate message error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
