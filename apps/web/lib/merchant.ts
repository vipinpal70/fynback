/**
 * lib/merchant.ts
 *
 * Helper to resolve Clerk userId → merchantId.
 *
 * WHY CACHED:
 * Every API route needs the merchantId. Without caching, each request would
 * hit the DB to look up users → memberships → merchantId (3 tables).
 * With Redis cache (30min TTL), the lookup is <1ms after the first request.
 *
 * WHY 30min TTL:
 * A user's merchant membership almost never changes mid-session. If a user
 * is removed from a merchant, they won't get new data after at most 30min.
 * This is an acceptable tradeoff for the performance gain.
 *
 * SECURITY: merchantId is never trusted from the client. It is always derived
 * from the authenticated Clerk session server-side.
 */

import { getRedis } from './cache/redis';
import { createDb, users, memberships, eq } from '@fynback/db';

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return createDb(url);
}

/**
 * Resolves a Clerk userId to the merchant's DB UUID.
 * Uses Redis cache to avoid a DB query on every API request.
 *
 * Flow: clerkUserId → users.id → memberships.merchantId
 *
 * @returns merchantId (UUID string) or null if user not found in DB
 */
export async function getMerchantIdFromClerkUserId(
  clerkUserId: string
): Promise<string | null> {
  const key = `user:${clerkUserId}:merchant`;

  // Try Redis first — but only trust a cached hit if it's a real UUID, not null.
  // WHY NOT CACHE NULL: If the user's merchant record doesn't exist yet (mid-onboarding)
  // or there's a transient DB error, we'd cache null for 30 min and every subsequent
  // API request would return 404 until the TTL expires. Null results must always
  // re-query the DB so the merchant appears as soon as onboarding completes.
  try {
    const redis = getRedis();
    const cached = await redis.get(key);
    if (cached !== null && cached !== 'null') {
      return JSON.parse(cached) as string;
    }
  } catch {
    // Redis unavailable — fall through to DB query
  }

  const db = getDb();
  const rows = await db
    .select({ merchantId: memberships.merchantId })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  const merchantId = rows[0]?.merchantId ?? null;

  // Only cache a real merchantId — never cache null
  if (merchantId !== null) {
    try {
      const redis = getRedis();
      await redis.setex(key, 30 * 60, JSON.stringify(merchantId));
    } catch {
      // Ignore — will re-derive on next request
    }
  }

  return merchantId;
}
