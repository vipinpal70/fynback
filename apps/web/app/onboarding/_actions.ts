'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { createDb, users, merchants, memberships, merchantBrandSettings, gatewayConnections, invites, eq, and, seedCampaignDefaults } from '@fynback/db'
import { welcomeQueue } from '@fynback/queue'
import Razorpay from 'razorpay'
import crypto from 'crypto'
import { encrypt } from '@/lib/crypto'
import { isTestKey as isRazorpayTestKey } from '@/lib/gateways/razorpay'
import { isTestKey as isCashfreeTestKey } from '@/lib/gateways/cashfree'
import { syncGatewayHistory } from '@/lib/gateways/sync'

const db = createDb(process.env.DATABASE_URL!);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_API_KEY!,
  key_secret: process.env.RAZORPAY_API_SECRET!,
});

export const createTrialPaymentOrder = async (country: string) => {
  const { isAuthenticated } = await auth()
  if (!isAuthenticated) return { error: 'Not authenticated' }

  const amount = country === 'IN' ? 1000 : 120; // 10 INR (1000 paise) or $1.2 (approx 120 cents)
  const currency = country === 'IN' ? 'INR' : 'USD';

  try {
    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt: `receipt_trial_${Date.now()}`,
    });
    return { orderId: order.id, amount, currency };
  } catch (err) {
    console.error('[createTrialPaymentOrder]', err);
    return { error: 'Failed to create payment order' };
  }
}

export const verifyTrialPayment = async (
  orderId: string,
  paymentId: string,
  signature: string
) => {
  const { isAuthenticated } = await auth()
  if (!isAuthenticated) return { error: 'Not authenticated' }

  const secret = process.env.RAZORPAY_API_SECRET!;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${orderId}|${paymentId}`);
  const generatedSignature = hmac.digest('hex');

  if (generatedSignature === signature) {
    return { success: true };
  } else {
    return { error: 'Invalid payment signature' };
  }
}

export const completeOnboarding = async (formData: FormData) => {
  const { isAuthenticated, userId } = await auth()

  if (!isAuthenticated || !userId) {
    return { error: 'Not authenticated' }
  }

  // ── 1. Collect fields ────────────────────────────────────────────────────
  const businessLegalName = formData.get('businessLegalName') as string
  const businessType = formData.get('businessType') as string || ""
  const websiteUrl = formData.get('websiteUrl') as string
  const mrrRange = formData.get('mrrRange') as string
  const gstNumber = (formData.get('gstNumber') as string) || ""
  const country = (formData.get('country') as string) || 'IN'
  const gatewayConnected = (formData.get('gateway') as string) || ""
  const gatewayApiKey = (formData.get('gatewayApiKey') as string) || ""
  const gatewayApiSecret = (formData.get('gatewayApiSecret') as string) || ""
  const fromName = formData.get('fromName') as string
  const replyToEmail = formData.get('replyToEmail') as string
  const brandColorHex = (formData.get('brandColorHex') as string) || '#3b82f6'
  const defaultRecoveryCampaign = (formData.get('defaultRecoveryCampaign') as string) || 'standard_10d'
  const whatsappOptIn = formData.get('whatsappOptIn') === 'true'
  const interaktApiKey = (formData.get('interaktApiKey') as string) || ''
  const slackWebhookUrl = (formData.get('slackWebhookUrl') as string) || ""
  const teamEmails = (formData.get('teamEmails') as string) || ""
  const digestFrequency = (formData.get('digestFrequency') as string) || 'daily'

  // Subscription fields
  const plan = (formData.get('plan') as string) || 'trial'
  const billingCycle = (formData.get('billingCycle') as string) || 'monthly'
  const trialActivationPaid = formData.get('trialActivationPaid') === 'true'
  const trialActivationTxnId = formData.get('trialActivationTxnId') as string

  // Clerk user object for name / email
  const client = await clerkClient()
  const clerkUser = await client.users.getUser(userId)
  const email = clerkUser.primaryEmailAddress?.emailAddress ?? ''
  const fullName = `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim()
  const companyName = businessLegalName || "My Business"

  try {
    // ── 2. Run Database Transaction ──────────────────────────────────────
    const result = await db.transaction(async (tx) => {
      // A. Upsert User
      const [userRecord] = await tx
        .insert(users)
        .values({
          clerkUserId: userId,
          email,
          fullName,
        })
        .onConflictDoUpdate({
          target: users.clerkUserId,
          set: {
            email,
            fullName,
            updatedAt: new Date(),
          },
        })
        .returning();

      // B. Create Merchant
      const [merchantRecord] = await tx
        .insert(merchants)
        .values({
          companyName,
          businessLegalName: businessLegalName || null,
          websiteUrl: websiteUrl || null,
          businessType: (businessType || null) as any,
          mrrRange: (mrrRange || null) as any,
          gstNumber,
          country,
          status: 'onboarding',
          onboardingStep: 6,
          plan: plan as any,
          billingCycle: billingCycle as any,
          trialActivationPaid,
          trialActivationTxnId: trialActivationTxnId || null,
          planSelectedAt: new Date(),
          onboardingCompletedAt: new Date(),
          trialStartedAt: new Date(),
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        })
        .returning();

      // C. Create Membership (Owner)
      await tx
        .insert(memberships)
        .values({
          userId: userRecord.id,
          merchantId: merchantRecord.id,
          role: 'owner',
          joinedAt: new Date(),
        });

      // D. Upsert Brand Settings
      const encryptedSlackWebhook = slackWebhookUrl ? encrypt(slackWebhookUrl) : ""
      await tx
        .insert(merchantBrandSettings)
        .values({
          merchantId: merchantRecord.id,
          fromName,
          replyToEmail,
          brandColorHex,
          whatsappEnabled: whatsappOptIn,
          interaktApiKeyEncrypted: (whatsappOptIn && interaktApiKey) ? encrypt(interaktApiKey) : null,
          slackWebhookUrl: encryptedSlackWebhook,
          digestFrequency: digestFrequency as any,
          defaultCampaignPreference: defaultRecoveryCampaign,
        })
        .onConflictDoUpdate({
          target: merchantBrandSettings.merchantId,
          set: {
            fromName,
            replyToEmail,
            brandColorHex,
            whatsappEnabled: whatsappOptIn,
            interaktApiKeyEncrypted: (whatsappOptIn && interaktApiKey) ? encrypt(interaktApiKey) : undefined,
            slackWebhookUrl: encryptedSlackWebhook,
            digestFrequency: digestFrequency as any,
            defaultCampaignPreference: defaultRecoveryCampaign,
            updatedAt: new Date(),
          },
        });

      // E. Create team invites (if emails were provided)
      const emailList = teamEmails
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0 && e.includes('@') && e.includes('.'))

      if (emailList.length > 0) {
        const inviteRows = emailList.map((email) => ({
          merchantId: merchantRecord.id,
          email,
          role: 'viewer' as const,
          token: crypto.randomBytes(32).toString('hex'),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          invitedBy: userRecord.id,
          status: 'pending',
        }))
        await tx.insert(invites).values(inviteRows).onConflictDoNothing()
      }

      return { merchantId: merchantRecord.id, userId: userRecord.id };
    });

    // ── 3. Mark onboarding complete in Clerk metadata ────────────────────
    await client.users.updateUser(userId, {
      publicMetadata: {
        onboardingComplete: true,
        merchantId: result.merchantId,
        gatewayConnected,
      },
    })

    // ── 4. Set cookie ────────────────────────────────────────────────────
    const cookieStore = await cookies()
    cookieStore.set('rcvrx_ob', '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })

    // ── 5. Auto-seed system default campaign templates ────────────────────
    // System defaults (merchantId = NULL) must exist before campaigns run.
    // On a fresh DB no seed has been run — we ensure they exist right here.
    // This is idempotent (ON CONFLICT DO NOTHING) and fires in the background
    // so it never blocks onboarding completion.
    seedCampaignDefaults(db)
      .catch((err) => console.error('[completeOnboarding] campaign defaults seed error (non-fatal):', err))

    // ── 6. Gateway connection + historical sync ──────────────────────────
    if (gatewayConnected && gatewayApiKey && gatewayApiSecret) {
      const webhookSecret = crypto.randomBytes(24).toString('hex')
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      try {
        const [conn] = await db
          .insert(gatewayConnections)
          .values({
            merchantId: result.merchantId,
            gatewayName: gatewayConnected as any,
            apiKeyEncrypted: encrypt(gatewayApiKey),
            apiSecretEncrypted: encrypt(gatewayApiSecret),
            webhookSecretEncrypted: encrypt(webhookSecret),
            webhookUrl: `${appUrl}/api/webhooks/${gatewayConnected}`,
            isActive: true,
            testMode:
              gatewayConnected === 'cashfree' ? isCashfreeTestKey(gatewayApiKey, gatewayApiSecret) :
                gatewayConnected === 'razorpay' ? isRazorpayTestKey(gatewayApiKey) :
                  false,
            connectedAt: new Date(),
          })
          .onConflictDoNothing()
          .returning({ id: gatewayConnections.id })

        // Sync in background — don't block onboarding completion
        if (conn?.id) {
          syncGatewayHistory(
            result.merchantId,
            conn.id,
            gatewayConnected as 'razorpay',
            gatewayApiKey,
            gatewayApiSecret
          ).catch((err) => console.error('[completeOnboarding] gateway sync error:', err))
        }
      } catch (err) {
        console.error('[completeOnboarding] gateway connect error:', err)
        // Non-fatal — user can connect from /dashboard/gateways
      }
    }

    // ── 6. Welcome Queue ─────────────────────────────────────────────────
    const onboardRedis = {
      clerkUserId: userId,
      merchantId: result.merchantId,
      email,
      fullName,
      companyName,
      status: 'onboarding',
      onboardingStep: 6,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      plan,
      trialActivationPaid,
      mrrRange,
    }

    await welcomeQueue.add("welcome", { onboardRedis })

    // ── 7. WhatsApp nudge email (non-blocking) ────────────────────────────
    // If the merchant opted into WhatsApp recovery but skipped the Interakt key,
    // send a one-time email reminding them to complete configuration.
    if (whatsappOptIn && !interaktApiKey) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.fynback.com'
      const settingsUrl = `${appUrl}/dashboard/settings?section=whatsapp`
      const firstName = fullName.split(' ')[0] || fullName

        // Fire-and-forget — never block onboarding completion
        ; (async () => {
          try {
            const { Resend } = await import('resend')
            const resend = new Resend(process.env.RESEND_API_KEY)
            await resend.emails.send({
              from: 'FynBack <noreply@fynback.com>',
              to: email,
              subject: '⚠️ Action needed: Your WhatsApp recovery channel is inactive',
              html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111118;border:1px solid #1e1e2e;border-radius:16px;overflow:hidden;max-width:560px;width:100%;">

        <!-- Header gradient bar -->
        <tr><td style="height:4px;background:linear-gradient(90deg,#f59e0b,#fb923c,#f59e0b);"></td></tr>

        <!-- Logo + Nav -->
        <tr><td style="padding:24px 32px 0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><span style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Fyn<span style="color:#3b82f6;">Back</span></span></td>
              <td align="right"><span style="font-size:12px;color:#6b7280;background:#1a1a2e;padding:4px 10px;border-radius:20px;">WhatsApp Recovery</span></td>
            </tr>
          </table>
        </td></tr>

        <!-- Warning icon + headline -->
        <tr><td style="padding:32px 32px 0;">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.25);border-radius:14px;margin-bottom:20px;">
            <span style="font-size:26px;">📱</span>
          </div>
          <h1 style="margin:0 0 10px;font-size:22px;font-weight:800;color:#ffffff;line-height:1.3;">
            Hi ${firstName}, your WhatsApp channel is inactive
          </h1>
          <p style="margin:0;font-size:15px;color:#9ca3af;line-height:1.6;">
            You enabled WhatsApp recovery during onboarding, but <strong style="color:#f59e0b;">your Interakt API key is missing</strong>.
            FynBack cannot send WhatsApp messages to your customers until this is configured.
          </p>
        </td></tr>

        <!-- Stats row -->
        <tr><td style="padding:24px 32px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #1e1e2e;border-radius:12px;overflow:hidden;">
            <tr style="background:#0d0d1a;">
              <td style="padding:16px;text-align:center;border-right:1px solid #1e1e2e;">
                <div style="font-size:28px;font-weight:800;color:#f59e0b;font-family:monospace;">42%</div>
                <div style="font-size:11px;color:#6b7280;margin-top:4px;">of recoveries via WhatsApp</div>
              </td>
              <td style="padding:16px;text-align:center;border-right:1px solid #1e1e2e;">
                <div style="font-size:28px;font-weight:800;color:#22c55e;font-family:monospace;">#1</div>
                <div style="font-size:11px;color:#6b7280;margin-top:4px;">channel in India</div>
              </td>
              <td style="padding:16px;text-align:center;">
                <div style="font-size:28px;font-weight:800;color:#3b82f6;font-family:monospace;">+12%</div>
                <div style="font-size:11px;color:#6b7280;margin-top:4px;">extra recovery rate</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Body text -->
        <tr><td style="padding:24px 32px 0;">
          <p style="margin:0 0 16px;font-size:14px;color:#9ca3af;line-height:1.7;">
            In India, <strong style="color:#ffffff;">WhatsApp has an open rate of over 90%</strong> compared to 20% for email.
            Merchants who configure WhatsApp recovery see an average <strong style="color:#22c55e;">8–12% increase in recovery rate</strong>.
            Every day without this configured is revenue walking out the door.
          </p>
        </td></tr>

        <!-- Steps -->
        <tr><td style="padding:0 32px;">
          <div style="background:#0d0d1a;border:1px solid #1e1e2e;border-radius:12px;padding:20px;">
            <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#ffffff;">Fix this in under 2 minutes:</p>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td width="28" valign="top" style="padding-bottom:10px;">
                  <div style="width:22px;height:22px;background:rgba(245,158,11,0.15);border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#f59e0b;">1</div>
                </td>
                <td style="padding-bottom:10px;padding-left:10px;font-size:13px;color:#9ca3af;">
                  Go to <a href="https://app.interakt.ai" style="color:#3b82f6;">interakt.ai</a> and sign up or log in to your account
                </td>
              </tr>
              <tr>
                <td width="28" valign="top" style="padding-bottom:10px;">
                  <div style="width:22px;height:22px;background:rgba(245,158,11,0.15);border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#f59e0b;">2</div>
                </td>
                <td style="padding-bottom:10px;padding-left:10px;font-size:13px;color:#9ca3af;">
                  Copy your secret key from <strong style="color:#ffffff;">Settings → Developer Setting</strong>
                </td>
              </tr>
              <tr>
                <td width="28" valign="top">
                  <div style="width:22px;height:22px;background:rgba(245,158,11,0.15);border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#f59e0b;">3</div>
                </td>
                <td style="padding-left:10px;font-size:13px;color:#9ca3af;">
                  Paste it in FynBack → Settings → WhatsApp tab below
                </td>
              </tr>
            </table>
          </div>
        </td></tr>

        <!-- CTA Button -->
        <tr><td style="padding:28px 32px;">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#f59e0b;border-radius:10px;" align="center">
                <a href="${settingsUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:800;color:#000000;text-decoration:none;letter-spacing:-0.2px;">
                  Add my Interakt key now →
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:12px 0 0;font-size:12px;color:#4b5563;">
            Or copy this link: <a href="${settingsUrl}" style="color:#3b82f6;">${settingsUrl}</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr>
          <td style="height:1px;background:#1e1e2e;"></td>
        </tr>
        <tr><td style="padding:20px 32px;">
          <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.6;">
            You received this because you signed up for FynBack and enabled WhatsApp recovery.
            This is a one-time reminder — we won't keep pestering you.<br/>
            <strong style="color:#6b7280;">FynBack</strong> · Automated Payment Recovery for Indian SaaS
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
            })
            console.log('[completeOnboarding] WhatsApp nudge email sent to', email)
          } catch (emailErr) {
            console.error('[completeOnboarding] WhatsApp nudge email failed (non-fatal):', emailErr)
          }
        })()
    }

    return { message: 'Onboarding complete', merchantId: result.merchantId }

  } catch (err) {
    console.error('[completeOnboarding]', err)
    return { error: 'Failed to save your profile. Please try again.' }
  }
}

export const acceptInvite = async (token: string) => {
  const { isAuthenticated, userId } = await auth()

  if (!isAuthenticated || !userId) {
    return { error: 'Not authenticated. Please sign in first.' }
  }

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Validate Invite
      const [invite] = await tx
        .select()
        .from(invites)
        .where(and(
          eq(invites.token, token),
          eq(invites.status, 'pending')
        ))
        .limit(1);

      if (!invite) {
        throw new Error('Invalid or expired invite token');
      }

      if (new Date() > invite.expiresAt) {
        await tx.update(invites).set({ status: 'expired' }).where(eq(invites.id, invite.id));
        throw new Error('Invite has expired');
      }

      // 2. Upsert User (logged-in user)
      const client = await clerkClient()
      const clerkUser = await client.users.getUser(userId)
      const email = clerkUser.primaryEmailAddress?.emailAddress ?? ''
      const fullName = `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim()

      const [userRecord] = await tx
        .insert(users)
        .values({
          clerkUserId: userId,
          email,
          fullName,
        })
        .onConflictDoUpdate({
          target: users.clerkUserId,
          set: {
            email,
            fullName,
            updatedAt: new Date(),
          },
        })
        .returning();

      // 3. Create Membership
      await tx
        .insert(memberships)
        .values({
          userId: userRecord.id,
          merchantId: invite.merchantId,
          role: invite.role,
          joinedAt: new Date(),
        })
        .onConflictDoNothing(); // Already a member?

      // 4. Update Invite
      await tx
        .update(invites)
        .set({ status: 'accepted', updatedAt: new Date() })
        .where(eq(invites.id, invite.id));

      return { merchantId: invite.merchantId };
    });

    // 5. Update Clerk Metadata
    const client = await clerkClient()
    await client.users.updateUser(userId, {
      publicMetadata: {
        onboardingComplete: true,
        merchantId: result.merchantId,
      },
    })

    // 6. Set Cookie
    const cookieStore = await cookies()
    cookieStore.set('rcvrx_ob', '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })

    return { message: 'Invite accepted', merchantId: result.merchantId }

  } catch (err: any) {
    console.error('[acceptInvite]', err)
    return { error: err.message || 'Failed to accept invite' }
  }
}
