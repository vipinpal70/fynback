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

import { cacheGetOrSet } from './cache/redis';
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
  return cacheGetOrSet(
    `user:${clerkUserId}:merchant`,
    30 * 60, // 30 minutes
    async () => {
      const db = getDb();

      // Join users → memberships to get merchantId in one query
      // WHY LEFT JOIN: We must return null (not throw) if the user hasn't completed
      // onboarding yet and doesn't have a membership record.
      const rows = await db
        .select({ merchantId: memberships.merchantId })
        .from(users)
        .innerJoin(memberships, eq(memberships.userId, users.id))
        .where(eq(users.clerkUserId, clerkUserId))
        .limit(1);

      return rows[0]?.merchantId ?? null;
    }
  );
}
