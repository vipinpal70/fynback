/**
 * GET /api/settings/merchant
 *
 * Returns all data needed for the settings page:
 * merchant profile, brand settings, team, gateway connections, and current user info.
 * Redis-cached for 5 minutes — busted when settings are saved.
 */

import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';
import { cacheGetOrSet } from '@/lib/cache/redis';
import {
  createDb, merchants, memberships, users,
  merchantBrandSettings, gatewayConnections, eq, and,
} from '@fynback/db';

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
          brand: brand ?? null,
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
