/**
 * GET /api/settings/merchant
 *
 * Returns all data needed for the settings page:
 * merchant profile, brand settings, team, gateway connections, and current user info.
 * Redis-cached for 5 minutes — busted when settings are saved.
 */

import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';
import { cacheGetOrSet, cacheDelete } from '@/lib/cache/redis';
import { encrypt, decrypt } from '@/lib/crypto';
import {
  createDb, merchants, memberships, users,
  merchantBrandSettings, gatewayConnections, eq, and,
} from '@fynback/db';

function tryDecrypt(val: string | null | undefined): string {
  if (!val) return '';
  try { return decrypt(val); } catch { return ''; }
}

const db = createDb(process.env.DATABASE_URL!);

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    // Get Clerk user for accurate name/email (not cached — Clerk is source of truth)
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);
    const currentUserFullName =
      `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim() ||
      clerkUser.username || '';
    const currentUserEmail = clerkUser.primaryEmailAddress?.emailAddress ?? '';

    const data = await cacheGetOrSet(
      `settings:merchant:${merchantId}`,
      5 * 60,
      async () => {
        const [merchant] = await db
          .select()
          .from(merchants)
          .where(eq(merchants.id, merchantId))
          .limit(1);

        if (!merchant) return null;

        const [brand] = await db
          .select()
          .from(merchantBrandSettings)
          .where(eq(merchantBrandSettings.merchantId, merchantId))
          .limit(1);

        const team = await db
          .select({
            id: memberships.id,
            role: memberships.role,
            joinedAt: memberships.joinedAt,
            email: users.email,
            fullName: users.fullName,
            clerkUserId: users.clerkUserId,
          })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(eq(memberships.merchantId, merchantId));

        const gateways = await db
          .select({
            id: gatewayConnections.id,
            gatewayName: gatewayConnections.gatewayName,
            isActive: gatewayConnections.isActive,
            testMode: gatewayConnections.testMode,
            webhookUrl: gatewayConnections.webhookUrl,
            lastWebhookReceivedAt: gatewayConnections.lastWebhookReceivedAt,
            connectedAt: gatewayConnections.connectedAt,
          })
          .from(gatewayConnections)
          .where(and(
            eq(gatewayConnections.merchantId, merchantId),
            eq(gatewayConnections.isActive, true)
          ));

        // Get current user's role
        const [myMembership] = await db
          .select({ role: memberships.role })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(and(eq(users.clerkUserId, userId), eq(memberships.merchantId, merchantId)))
          .limit(1);

        return {
          merchant,
          brand: brand
            ? {
                ...brand,
                // Decrypt at the API layer — never send ciphertext to the client
                slackWebhookUrl: tryDecrypt(brand.slackWebhookUrl),
                interaktApiKey: tryDecrypt(brand.interaktApiKeyEncrypted),
              }
            : null,
          team,
          gateways,
          currentUserRole: myMembership?.role ?? 'owner',
        };
      }
    );

    if (!data) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    return NextResponse.json(
      { ...data, currentUserFullName, currentUserEmail },
      { headers: { 'Cache-Control': 'private, max-age=60' } }
    );
  } catch (err) {
    console.error('[API] /api/settings/merchant error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── PATCH: save brand settings ───────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const merchantId = await getMerchantIdFromClerkUserId(userId);
    if (!merchantId) return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });

    const body = await req.json();
    const {
      fromName,
      fromEmail,
      replyToEmail,
      brandColorHex,
      defaultCampaignPreference,
      slackWebhookUrl,
      whatsappEnabled,
      digestFrequency,
      companyName,
      websiteUrl,
      logoUrl,
      companyTagline,
      interaktApiKey,
    } = body;

    const db = createDb(process.env.DATABASE_URL!);

    // Update merchants table fields if provided
    if (companyName !== undefined || websiteUrl !== undefined) {
      const merchantUpdate: Record<string, unknown> = { updatedAt: new Date() };
      if (companyName !== undefined) merchantUpdate.companyName = companyName;
      if (websiteUrl !== undefined) merchantUpdate.websiteUrl = websiteUrl;
      await db.update(merchants).set(merchantUpdate as any).where(eq(merchants.id, merchantId));
    }

    // Build brand settings update
    const brandUpdate: Record<string, unknown> = { updatedAt: new Date() };
    if (fromName !== undefined) brandUpdate.fromName = fromName;
    if (fromEmail !== undefined) brandUpdate.fromEmail = fromEmail;
    if (replyToEmail !== undefined) brandUpdate.replyToEmail = replyToEmail;
    if (brandColorHex !== undefined) brandUpdate.brandColorHex = brandColorHex;
    if (defaultCampaignPreference !== undefined) brandUpdate.defaultCampaignPreference = defaultCampaignPreference;
    if (whatsappEnabled !== undefined) brandUpdate.whatsappEnabled = whatsappEnabled;
    if (digestFrequency !== undefined) brandUpdate.digestFrequency = digestFrequency;
    if (logoUrl !== undefined) brandUpdate.logoUrl = logoUrl || null;
    if (companyTagline !== undefined) brandUpdate.companyTagline = companyTagline || null;
    // Encrypt slack URL only if a new non-empty value was provided
    if (slackWebhookUrl !== undefined) {
      brandUpdate.slackWebhookUrl = slackWebhookUrl ? encrypt(slackWebhookUrl) : '';
    }
    // Encrypt Interakt key — empty string clears it
    if (interaktApiKey !== undefined) {
      brandUpdate.interaktApiKeyEncrypted = interaktApiKey ? encrypt(interaktApiKey) : null;
    }

    await db
      .insert(merchantBrandSettings)
      .values({ merchantId, ...brandUpdate as any })
      .onConflictDoUpdate({
        target: merchantBrandSettings.merchantId,
        set: brandUpdate as any,
      });

    // Bust the settings cache so the next GET returns fresh data
    await cacheDelete(`settings:merchant:${merchantId}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API] PATCH /api/settings/merchant error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
