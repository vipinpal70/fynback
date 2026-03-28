/**
 * POST /api/auth/logout
 *
 * Server-side logout cleanup: purges all Redis cache entries tied to
 * the current user and their merchant so the next session starts fresh.
 *
 * WHAT IT CLEARS:
 *   - user:{clerkUserId}:merchant     → merchantId lookup cache
 *   - settings:merchant:{merchantId}  → settings page cache
 *   - kpis:{merchantId}               → dashboard KPIs
 *   - payments:{merchantId}:*         → payments lists
 *   - analytics:{merchantId}:*        → analytics data
 *   - gateways:{merchantId}           → gateway connection cache
 *
 * WHY A DEDICATED ROUTE (not inline in the client signOut):
 * Redis is server-only. The client cannot reach it directly. This route
 * runs inside the Next.js server context with access to process.env.REDIS_URL.
 *
 * SECURITY: auth() verifies the Clerk session — only the authenticated user
 * can flush their own cache.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getMerchantIdFromClerkUserId } from '@/lib/merchant';
import { getRedis } from '@/lib/cache/redis';

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    // Already logged out server-side — that's fine, return 200
    return NextResponse.json({ ok: true });
  }

  try {
    const redis = getRedis();

    // 1. Resolve merchantId (may already be in cache)
    const merchantId = await getMerchantIdFromClerkUserId(userId);

    // 2. Delete the user → merchant lookup cache entry
    await redis.del(`user:${userId}:merchant`).catch(() => {});

    if (merchantId) {
      // 3. Delete all keys that contain the merchantId (broad sweep)
      //    This covers: kpis:{mid}, payments:{mid}:*, analytics:{mid}:*,
      //    gateways:{mid}, settings:merchant:{mid}, etc.
      const patterns = [
        `*${merchantId}*`,   // catches all patterns using this merchantId
      ];

      for (const pattern of patterns) {
        let cursor = '0';
        do {
          const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
          if (keys.length > 0) {
            await redis.del(...keys).catch(() => {});
          }
          cursor = next;
        } while (cursor !== '0');
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Non-fatal — Clerk sign-out still happens on the client
    console.error('[API] /api/auth/logout cache flush error:', err);
    return NextResponse.json({ ok: true });
  }
}
