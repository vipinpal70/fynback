/**
 * GET /api/user/me
 *
 * Returns the current user's profile, role, and merchant plan/trial info.
 * Used by DashboardSidebar to show real name, initials, and trial badge.
 *
 * Cached 5 minutes — changes only on plan upgrade or profile update.
 */

import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';
import { cacheGetOrSet } from '@/lib/cache/redis';
import { createDb, users, merchants, memberships, eq, and } from '@fynback/db';

const db = createDb(process.env.DATABASE_URL!);

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await cacheGetOrSet(
      `user:me:${userId}`,
      5 * 60,
      async () => {
        // Get Clerk user for name/email (source of truth for profile)
        const client = await clerkClient();
        const clerkUser = await client.users.getUser(userId);
        const fullName =
          `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim() ||
          clerkUser.username ||
          'Unknown';
        const email = clerkUser.primaryEmailAddress?.emailAddress ?? '';

        const merchantId = await getMerchantIdFromClerkUserId(userId);
        if (!merchantId) {
          return { fullName, email, initials: initials(fullName), role: 'owner', plan: 'trial', trialDaysLeft: null, merchantId: null };
        }

        // Get role from memberships
        const [membership] = await db
          .select({ role: memberships.role })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(and(eq(users.clerkUserId, userId), eq(memberships.merchantId, merchantId)))
          .limit(1);

        // Get plan + trial info from merchant
        const [merchant] = await db
          .select({
            plan: merchants.plan,
            trialEndsAt: merchants.trialEndsAt,
            status: merchants.status,
            companyName: merchants.companyName,
          })
          .from(merchants)
          .where(eq(merchants.id, merchantId))
          .limit(1);

        const trialDaysLeft =
          merchant?.trialEndsAt
            ? Math.max(0, Math.ceil((new Date(merchant.trialEndsAt).getTime() - Date.now()) / 86_400_000))
            : null;

        return {
          fullName,
          email,
          initials: initials(fullName),
          role: membership?.role ?? 'owner',
          plan: merchant?.plan ?? 'trial',
          status: merchant?.status ?? 'active',
          trialDaysLeft,
          companyName: merchant?.companyName ?? '',
          merchantId,
        };
      }
    );

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  } catch (err) {
    console.error('[API] /api/user/me error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('');
}
