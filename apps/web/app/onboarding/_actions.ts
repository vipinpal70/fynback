'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { createDb, users, merchants, memberships, merchantBrandSettings, gatewayConnections, invites, eq, and } from '@fynback/db'
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

        // ── 5. Gateway connection + historical sync ──────────────────────────
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
