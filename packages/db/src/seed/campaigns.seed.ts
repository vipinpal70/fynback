/**
 * seed/campaigns.seed.ts
 *
 * Seeds system-default campaign templates for all four plan tiers.
 * This is idempotent — safe to run multiple times (uses ON CONFLICT DO NOTHING).
 *
 * SYSTEM DEFAULTS CREATED:
 *   trial/starter  → 3 steps: day 0, 2, 4
 *   growth         → 5 steps: day 0, 2, 4, 6, 8 (pause offer at step 3 = day 4)
 *   scale          → 5 steps: day 0, 2, 4, 6, 8 (same structure, higher limits)
 *
 * Each step gets message templates for email, whatsapp, and sms channels.
 * Template bodies use {{variable}} placeholders substituted at send time:
 *   {{customer_name}}   → customer's first name (or "there" if unknown)
 *   {{amount}}          → formatted amount e.g. "₹2,400" or "$12.00"
 *   {{merchant_name}}   → merchant's company name
 *   {{payment_link}}    → merchant's checkout/payment page URL
 *   {{product_name}}    → merchant's product/service name (falls back to company name)
 *
 * RUN WITH: pnpm --filter @fynback/db seed
 */

import { createDb } from '../index';
import {
  campaignTemplates,
  campaignSteps,
  messageTemplates,
} from '../schema/campaigns';

// ─────────────────────────────────────────────────────────────────────────────
// Template definitions
// ─────────────────────────────────────────────────────────────────────────────

interface StepDef {
  stepNumber: number;
  dayOffset: number;
  preferredChannel: 'email' | 'whatsapp' | 'sms';
  isPauseOffer: boolean;
  messages: {
    channel: 'email' | 'whatsapp' | 'sms';
    subject?: string;
    bodyHtml?: string;
    bodyText: string;
    variables: string[];
  }[];
}

interface TemplateDef {
  name: string;
  planRequired: string;
  maxSteps: number;
  pauseOfferStep: number | null;
  steps: StepDef[];
}

const TEMPLATES: TemplateDef[] = [
  // ── Trial ─────────────────────────────────────────────────────────────────
  {
    name: 'Default Trial Recovery',
    planRequired: 'trial',
    maxSteps: 3,
    pauseOfferStep: null,
    steps: buildTrialStarterSteps(),
  },
  // ── Starter ───────────────────────────────────────────────────────────────
  {
    name: 'Default Starter Recovery',
    planRequired: 'starter',
    maxSteps: 3,
    pauseOfferStep: null,
    steps: buildTrialStarterSteps(),
  },
  // ── Growth ────────────────────────────────────────────────────────────────
  {
    name: 'Default Growth Recovery',
    planRequired: 'growth',
    maxSteps: 5,
    pauseOfferStep: 3,
    steps: buildGrowthSteps(),
  },
  // ── Scale ─────────────────────────────────────────────────────────────────
  {
    name: 'Default Scale Recovery',
    planRequired: 'scale',
    maxSteps: 15,
    pauseOfferStep: 3,
    steps: buildScaleSteps(),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Step builders
// ─────────────────────────────────────────────────────────────────────────────

function buildTrialStarterSteps(): StepDef[] {
  return [
    {
      stepNumber: 1,
      dayOffset: 0,
      preferredChannel: 'email',
      isPauseOffer: false,
      messages: [
        {
          channel: 'email',
          subject: 'Action needed: Your {{merchant_name}} payment couldn\'t be processed',
          bodyHtml: step1EmailHtml(),
          bodyText: step1EmailText(),
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link'],
        },
        {
          channel: 'whatsapp',
          bodyText: `Hi {{customer_name}} 👋\n\nYour {{merchant_name}} payment of {{amount}} couldn't be processed.\n\nPlease update your payment details to continue your subscription:\n{{payment_link}}\n\nReply if you need help.`,
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link'],
        },
        {
          channel: 'sms',
          bodyText: `{{merchant_name}}: Hi {{customer_name}}, your payment of {{amount}} failed. Tap to pay: {{payment_link}}`,
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link'],
        },
      ],
    },
    {
      stepNumber: 2,
      dayOffset: 2,
      preferredChannel: 'email',
      isPauseOffer: false,
      messages: [
        {
          channel: 'email',
          subject: 'Reminder: Your {{merchant_name}} subscription is at risk',
          bodyHtml: step2EmailHtml(),
          bodyText: step2EmailText(),
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link'],
        },
        {
          channel: 'whatsapp',
          bodyText: `Hi {{customer_name}},\n\nThis is a reminder that your {{merchant_name}} payment of {{amount}} is still unpaid.\n\nYour access may be paused soon. Update your payment now:\n{{payment_link}}`,
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link'],
        },
        {
          channel: 'sms',
          bodyText: `{{merchant_name}}: Reminder - payment of {{amount}} still due. Update now: {{payment_link}}`,
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link'],
        },
      ],
    },
    {
      stepNumber: 3,
      dayOffset: 4,
      preferredChannel: 'email',
      isPauseOffer: false,
      messages: [
        {
          channel: 'email',
          subject: '⚠️ Final notice: {{merchant_name}} subscription cancels in 24 hours',
          bodyHtml: step3FinalEmailHtml(false),
          bodyText: step3FinalEmailText(false),
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link', 'product_name'],
        },
        {
          channel: 'whatsapp',
          bodyText: `⚠️ Final notice, {{customer_name}}.\n\nYour {{merchant_name}} subscription will be cancelled in 24 hours if payment of {{amount}} isn't received.\n\nYou'll lose access to {{product_name}}.\n\nPay now to keep your access:\n{{payment_link}}`,
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link', 'product_name'],
        },
        {
          channel: 'sms',
          bodyText: `{{merchant_name}}: FINAL NOTICE - subscription cancels in 24h if {{amount}} not paid. Pay: {{payment_link}}`,
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link'],
        },
      ],
    },
  ];
}

function buildGrowthSteps(): StepDef[] {
  return [
    {
      stepNumber: 1,
      dayOffset: 0,
      preferredChannel: 'email',
      isPauseOffer: false,
      messages: [
        {
          channel: 'email',
          subject: 'Action needed: Your {{merchant_name}} payment couldn\'t be processed',
          bodyHtml: step1EmailHtml(),
          bodyText: step1EmailText(),
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link'],
        },
        {
          channel: 'whatsapp',
          bodyText: `Hi {{customer_name}} 👋\n\nYour {{merchant_name}} payment of {{amount}} couldn't be processed.\n\nPlease update your payment details:\n{{payment_link}}\n\nReply if you need help.`,
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link'],
        },
        {
          channel: 'sms',
          bodyText: `{{merchant_name}}: Hi {{customer_name}}, payment of {{amount}} failed. Tap to pay: {{payment_link}}`,
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link'],
        },
      ],
    },
    {
      stepNumber: 2,
      dayOffset: 2,
      preferredChannel: 'email',
      isPauseOffer: false,
      messages: [
        {
          channel: 'email',
          subject: 'Reminder: Your {{merchant_name}} subscription is at risk',
          bodyHtml: step2EmailHtml(),
          bodyText: step2EmailText(),
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link'],
        },
        {
          channel: 'whatsapp',
          bodyText: `Hi {{customer_name}},\n\nYour {{merchant_name}} payment of {{amount}} is still unpaid. Your access may be paused soon.\n\nUpdate payment now:\n{{payment_link}}`,
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link'],
        },
        {
          channel: 'sms',
          bodyText: `{{merchant_name}}: Reminder - payment of {{amount}} still due. Update: {{payment_link}}`,
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link'],
        },
      ],
    },
    {
      // Step 3 = pause offer step (day 4) — Growth default
      stepNumber: 3,
      dayOffset: 4,
      preferredChannel: 'email',
      isPauseOffer: true,
      messages: [
        {
          channel: 'email',
          subject: 'We\'d like to help — pause your {{merchant_name}} subscription?',
          bodyHtml: step3PauseOfferEmailHtml(),
          bodyText: step3PauseOfferEmailText(),
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link', 'product_name'],
        },
        {
          channel: 'whatsapp',
          bodyText: `Hi {{customer_name}},\n\nWe noticed your {{merchant_name}} payment of {{amount}} is still pending.\n\nNot a good time? We can *pause your subscription for a month* — no charges, your data stays safe.\n\nOr pay now to keep uninterrupted access:\n{{payment_link}}\n\nReply YES to pause, or click above to pay.`,
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link'],
        },
        {
          channel: 'sms',
          bodyText: `{{merchant_name}}: Payment of {{amount}} still due. Need a break? Reply PAUSE or pay now: {{payment_link}}`,
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link'],
        },
      ],
    },
    {
      stepNumber: 4,
      dayOffset: 6,
      preferredChannel: 'email',
      isPauseOffer: false,
      messages: [
        {
          channel: 'email',
          subject: 'Urgent: {{merchant_name}} subscription access at risk',
          bodyHtml: step4UrgentEmailHtml(),
          bodyText: step4UrgentEmailText(),
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link', 'product_name'],
        },
        {
          channel: 'whatsapp',
          bodyText: `⚠️ Urgent, {{customer_name}}.\n\n{{merchant_name}} payment of {{amount}} is 6 days overdue.\n\nYou'll lose access to {{product_name}} very soon.\n\nPay immediately:\n{{payment_link}}`,
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link', 'product_name'],
        },
        {
          channel: 'sms',
          bodyText: `{{merchant_name}} URGENT: {{amount}} overdue, access at risk. Pay now: {{payment_link}}`,
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link'],
        },
      ],
    },
    {
      stepNumber: 5,
      dayOffset: 8,
      preferredChannel: 'email',
      isPauseOffer: false,
      messages: [
        {
          channel: 'email',
          subject: '⚠️ Final notice: {{merchant_name}} subscription cancels in 24 hours',
          bodyHtml: step3FinalEmailHtml(true),
          bodyText: step3FinalEmailText(true),
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link', 'product_name'],
        },
        {
          channel: 'whatsapp',
          bodyText: `⚠️ Final notice, {{customer_name}}.\n\nYour {{merchant_name}} subscription will be cancelled in 24 hours.\n\nYou'll permanently lose access to {{product_name}}.\n\nThis is your last chance to pay {{amount}} and save your subscription:\n{{payment_link}}`,
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link', 'product_name'],
        },
        {
          channel: 'sms',
          bodyText: `{{merchant_name}} FINAL NOTICE: subscription cancels in 24h. Pay {{amount}} now: {{payment_link}}`,
          variables: ['customer_name', 'amount', 'merchant_name', 'payment_link'],
        },
      ],
    },
  ];
}

function buildScaleSteps(): StepDef[] {
  // Scale uses the same 5 default steps as Growth to start.
  // Merchants can add up to 15 steps via custom campaigns.
  return buildGrowthSteps();
}

// ─────────────────────────────────────────────────────────────────────────────
// Email HTML builders
// ─────────────────────────────────────────────────────────────────────────────

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#08090c;font-family:-apple-system,'DM Sans',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td>
<table width="560" cellpadding="0" cellspacing="0" align="center" style="max-width:560px;margin:0 auto;padding:40px 16px;">
<tr><td>
  <div style="border-top:3px solid {{brand_color}};padding-top:24px;margin-bottom:32px;">
    <p style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0;">{{merchant_name}}</p>
  </div>
  ${content}
  <div style="border-top:1px solid #1a1a1a;padding-top:20px;margin-top:32px;">
    <p style="color:#555;font-size:12px;margin:0;">
      Sent by {{merchant_name}}. Questions? Reply to this email.
    </p>
  </div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function amountBlock(): string {
  return `<div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:16px;margin:0 0 24px 0;">
  <p style="color:#888;font-size:12px;margin:0 0 4px 0;text-transform:uppercase;letter-spacing:0.5px;">Amount Due</p>
  <p style="color:#fff;font-size:28px;font-weight:700;margin:0;font-family:'DM Mono',monospace;">{{amount}}</p>
</div>`;
}

function ctaButton(text: string): string {
  return `<a href="{{payment_link}}" style="display:block;background:{{brand_color}};color:#000;text-decoration:none;padding:14px 24px;border-radius:6px;font-size:16px;font-weight:600;text-align:center;margin:0 0 24px 0;">${text} →</a>`;
}

function step1EmailHtml(): string {
  return emailWrapper(`
    <p style="color:#e0e0e0;font-size:16px;line-height:1.6;margin:0 0 16px 0;">Hi {{customer_name}},</p>
    <p style="color:#e0e0e0;font-size:16px;line-height:1.6;margin:0 0 24px 0;">
      We couldn't process your recent payment for your {{merchant_name}} subscription. Don't worry — this happens sometimes and is usually quick to fix.
    </p>
    ${amountBlock()}
    ${ctaButton('Update Payment Method')}
    <p style="color:#aaa;font-size:14px;line-height:1.6;margin:0;">
      Your subscription is still active for now. Please update your payment details to avoid any interruption.
    </p>
  `);
}

function step1EmailText(): string {
  return `Hi {{customer_name}},

We couldn't process your recent {{merchant_name}} payment of {{amount}}.

Please update your payment details to avoid interruption to your subscription:
{{payment_link}}

Your subscription is still active for now.

— {{merchant_name}} Team`;
}

function step2EmailHtml(): string {
  return emailWrapper(`
    <p style="color:#e0e0e0;font-size:16px;line-height:1.6;margin:0 0 16px 0;">Hi {{customer_name}},</p>
    <p style="color:#e0e0e0;font-size:16px;line-height:1.6;margin:0 0 24px 0;">
      This is a reminder that your {{merchant_name}} payment is still pending. Your subscription access may be paused if payment isn't received soon.
    </p>
    ${amountBlock()}
    ${ctaButton('Pay Now & Keep Access')}
    <p style="color:#aaa;font-size:14px;line-height:1.6;margin:0;">
      If you've already updated your payment method, please ignore this message.
    </p>
  `);
}

function step2EmailText(): string {
  return `Hi {{customer_name}},

Your {{merchant_name}} payment of {{amount}} is still pending.

Your subscription access may be paused soon. Please pay now to avoid interruption:
{{payment_link}}

— {{merchant_name}} Team`;
}

function step3FinalEmailHtml(isGrowth: boolean): string {
  const benefits = isGrowth
    ? `<ul style="color:#e0e0e0;font-size:14px;line-height:1.8;padding-left:20px;margin:16px 0;">
        <li>Uninterrupted access to {{product_name}}</li>
        <li>All your data, settings, and history preserved</li>
        <li>Continue where you left off instantly</li>
      </ul>`
    : '';
  return emailWrapper(`
    <p style="color:#e0e0e0;font-size:16px;line-height:1.6;margin:0 0 16px 0;">Hi {{customer_name}},</p>
    <p style="color:#e4534a;font-size:16px;font-weight:600;line-height:1.6;margin:0 0 16px 0;">
      This is your final notice. Your {{merchant_name}} subscription will be cancelled in 24 hours.
    </p>
    <p style="color:#e0e0e0;font-size:16px;line-height:1.6;margin:0 0 24px 0;">
      Once cancelled, you'll lose access to {{product_name}} and all associated data.
    </p>
    ${amountBlock()}
    ${benefits}
    ${ctaButton('Save My Subscription Now')}
    <p style="color:#888;font-size:13px;line-height:1.6;margin:0;">
      If you believe this is an error or need assistance, please reply to this email immediately.
    </p>
  `);
}

function step3FinalEmailText(isGrowth: boolean): string {
  return `Hi {{customer_name}},

FINAL NOTICE: Your {{merchant_name}} subscription will be cancelled in 24 hours.

Once cancelled, you'll lose access to {{product_name}}.

Amount due: {{amount}}

Pay now to keep your subscription:
{{payment_link}}

— {{merchant_name}} Team`;
}

function step3PauseOfferEmailHtml(): string {
  return emailWrapper(`
    <p style="color:#e0e0e0;font-size:16px;line-height:1.6;margin:0 0 16px 0;">Hi {{customer_name}},</p>
    <p style="color:#e0e0e0;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
      Your {{merchant_name}} payment of {{amount}} is still pending. We understand that timing isn't always perfect.
    </p>
    ${amountBlock()}
    ${ctaButton('Pay Now & Keep Full Access')}
    <div style="margin:0 0 24px 0;padding:20px;border:1px solid #2a2a2a;border-radius:8px;background:#111;">
      <p style="color:#888;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px 0;">Not ready to pay right now?</p>
      <p style="color:#e0e0e0;font-size:15px;line-height:1.6;margin:0 0 12px 0;">
        We can <strong>pause your subscription for 1 month</strong> — no charges, your data stays safe, and you can resume anytime.
      </p>
      <a href="{{payment_link}}?action=pause" style="color:#00e878;text-decoration:underline;font-size:14px;">
        Request a 1-month pause instead →
      </a>
    </div>
    <p style="color:#888;font-size:13px;line-height:1.6;margin:0;">
      Choosing to pause sends a request to {{merchant_name}} for approval.
    </p>
  `);
}

function step3PauseOfferEmailText(): string {
  return `Hi {{customer_name}},

Your {{merchant_name}} payment of {{amount}} is still pending.

PAY NOW to keep your {{product_name}} access:
{{payment_link}}

— OR —

Not ready to pay? Request a 1-month pause (no charges):
{{payment_link}}?action=pause

Pausing requires approval from {{merchant_name}}.

— {{merchant_name}} Team`;
}

function step4UrgentEmailHtml(): string {
  return emailWrapper(`
    <p style="color:#e0e0e0;font-size:16px;line-height:1.6;margin:0 0 16px 0;">Hi {{customer_name}},</p>
    <p style="color:#f59e0b;font-size:16px;font-weight:600;line-height:1.6;margin:0 0 16px 0;">
      ⚠️ Your {{merchant_name}} access is at serious risk.
    </p>
    <p style="color:#e0e0e0;font-size:16px;line-height:1.6;margin:0 0 24px 0;">
      Your payment has been overdue for 6 days. Without payment, your {{product_name}} subscription will be cancelled very soon and you'll lose all access.
    </p>
    ${amountBlock()}
    ${ctaButton('Pay Immediately & Keep Access')}
    <p style="color:#888;font-size:13px;line-height:1.6;margin:0;">
      This is an urgent notice. Please act now to avoid losing your {{product_name}} subscription.
    </p>
  `);
}

function step4UrgentEmailText(): string {
  return `Hi {{customer_name}},

URGENT: Your {{merchant_name}} payment of {{amount}} is 6 days overdue.

You'll lose access to {{product_name}} very soon.

Pay immediately:
{{payment_link}}

— {{merchant_name}} Team`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed runner
// ─────────────────────────────────────────────────────────────────────────────

export async function seedCampaignDefaults(db: ReturnType<typeof createDb>) {
  console.log('[Seed] Starting campaign defaults seed...');

  for (const templateDef of TEMPLATES) {
    // Check if system default already exists for this plan
    const existing = await db
      .select({ id: campaignTemplates.id })
      .from(campaignTemplates)
      .where(
        // We use raw SQL here to filter on NULL merchant_id without a helper import
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (t: any) =>
          // merchant_id IS NULL AND plan_required = ? AND type = 'system_default'
          // Drizzle doesn't have isNull() in this scope, so we check via the result
          t
      )
      .limit(1);

    // Simple approach: always try to insert, use ON CONFLICT DO NOTHING on name + type
    const [template] = await db
      .insert(campaignTemplates)
      .values({
        merchantId: null,
        name: templateDef.name,
        type: 'system_default',
        planRequired: templateDef.planRequired,
        declineCategoryFilter: null,
        isActive: true,
        isPaused: false,
        maxSteps: templateDef.maxSteps,
        pauseOfferStep: templateDef.pauseOfferStep,
        description: `System default recovery campaign for ${templateDef.planRequired} plan`,
      })
      .onConflictDoNothing()
      .returning();

    if (!template) {
      console.log(`[Seed] Template '${templateDef.name}' already exists — skipping`);
      continue;
    }

    console.log(`[Seed] Created template: ${template.name} (${template.id})`);

    // Seed the steps
    for (const stepDef of templateDef.steps) {
      const [step] = await db
        .insert(campaignSteps)
        .values({
          campaignTemplateId: template.id,
          stepNumber: stepDef.stepNumber,
          dayOffset: stepDef.dayOffset,
          preferredChannel: stepDef.preferredChannel,
          isPauseOffer: stepDef.isPauseOffer,
        })
        .onConflictDoNothing()
        .returning();

      if (!step) continue;

      console.log(`[Seed]   Step ${stepDef.stepNumber} (day ${stepDef.dayOffset}) → ${step.id}`);

      // Seed message templates for each channel
      for (const msg of stepDef.messages) {
        await db
          .insert(messageTemplates)
          .values({
            campaignStepId: step.id,
            channel: msg.channel,
            subject: msg.subject ?? null,
            bodyHtml: msg.bodyHtml ?? null,
            bodyText: msg.bodyText,
            variables: msg.variables,
            isAiGenerated: false,
          })
          .onConflictDoNothing();
      }
    }
  }

  console.log('[Seed] Campaign defaults seed complete ✓');
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI runner (pnpm --filter @fynback/db seed)
// ─────────────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[Seed] DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const { createDb: makeDb } = require('../index');
  const db = makeDb(url);

  seedCampaignDefaults(db)
    .then(() => process.exit(0))
    .catch((err: Error) => {
      console.error('[Seed] Error:', err);
      process.exit(1);
    });
}
