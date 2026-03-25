/**
 * lib/cache/redis.ts
 *
 * Singleton Redis client for server-side caching in Next.js.
 *
 * WHY globalThis SINGLETON PATTERN:
 * Next.js hot reload re-executes module code on every file change during dev.
 * Without globalThis, each hot reload creates a NEW Redis connection while the
 * old one leaks (never closed). With globalThis, the second require gets the
 * existing instance from the global cache instead of creating a new connection.
 *
 * WHY IOREDIS (not node-redis):
 * ioredis has better TypeScript types, automatic reconnection with backoff,
 * and is what BullMQ uses internally — so our deps stay consistent.
 *
 * WHY NOT import from @fynback/redis PACKAGE:
 * That package is configured for BullMQ (maxRetriesPerRequest: null).
 * For cache reads, we want standard timeout behavior — if Redis is down,
 * we fall back to DB rather than hanging indefinitely.
 */

import Redis from 'ioredis';

// Extend globalThis for TypeScript so `global.__redis` is typed
declare global {
  // eslint-disable-next-line no-var
  var __redisCache: Redis | undefined;
}

/**
 * Returns the singleton Redis client, creating it on first call.
 * Subsequent calls (including after hot reload) return the same instance.
 */
export function getRedis(): Redis {
  if (!global.__redisCache) {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is not set');
    }

    global.__redisCache = new Redis(redisUrl, {
      // Allow connection reuse across requests — critical for performance
      maxRetriesPerRequest: 3,

      // Short connect timeout — we'd rather fall back to DB quickly than wait
      connectTimeout: 3000,

      // Reconnect with exponential backoff (1s, 2s, 4s, max 10s)
      // WHY: Redis restarts during deploys. Automatic reconnect prevents cache
      // layer from permanently failing after a Redis restart.
      retryStrategy: (times) => Math.min(times * 1000, 10000),

      // Lazy connect — don't connect until first command is sent
      // WHY: Prevents connection errors from crashing the Next.js server
      // startup if Redis isn't ready yet during cold start.
      lazyConnect: true,
    });

    // Log connection events in dev — helps diagnose cache misses
    if (process.env.NODE_ENV === 'development') {
      global.__redisCache.on('connect', () => console.log('[Redis] Connected'));
      global.__redisCache.on('error', (err) => console.error('[Redis] Error:', err.message));
    }
  }

  return global.__redisCache;
}

/**
 * Cache-aside pattern helper. Checks Redis first; on miss, calls fn() and stores result.
 *
 * WHY GENERIC: Different cache functions return different shapes (KPIs, payments array, etc.).
 * The generic <T> ensures callers get correctly typed results without casting.
 *
 * WHY JSON serialization (not msgpack):
 * JSON is sufficient for our use case and keeps the implementation simple.
 * The serialization overhead is negligible compared to DB query time.
 *
 * @param key - Redis key (e.g., "kpis:merchant_123")
 * @param ttlSeconds - Time-to-live in seconds
 * @param fn - Async function to call on cache miss
 * @returns Cached or freshly computed value
 */
export async function cacheGetOrSet<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  let redis: Redis;
  try {
    redis = getRedis();
  } catch {
    // Redis not configured (e.g., during testing) — fall through to DB
    return fn();
  }

  try {
    const cached = await redis.get(key);

    if (cached !== null) {
      // Cache hit — parse and return without hitting the DB
      return JSON.parse(cached) as T;
    }
  } catch (err) {
    // Redis error (connection lost, timeout) — fall through to DB query
    // WHY CATCH: Cache is a performance optimization, not a hard requirement.
    // If Redis is down, the dashboard should still work (just slower).
    console.error(`[Redis] Cache get failed for key "${key}":`, err);
  }

  // Cache miss — fetch from source
  const value = await fn();

  try {
    // Store with TTL using SETEX (SET + EXpire in one command)
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    // Log but don't throw — the value is still returned to the caller
    console.error(`[Redis] Cache set failed for key "${key}":`, err);
  }

  return value;
}

/**
 * Invalidates a specific cache key.
 * Called after mutations (e.g., gateway connected/disconnected).
 */
export async function cacheDelete(key: string): Promise<void> {
  try {
    await getRedis().del(key);
  } catch {
    // Ignore — stale cache will expire naturally via TTL
  }
}

/**
 * Invalidates all cache keys for a merchant.
 * Called when significant merchant state changes (e.g., all gateways disconnected).
 *
 * WHY SCAN (not KEYS): KEYS blocks the Redis event loop and is O(N).
 * SCAN is non-blocking and safe on production Redis instances.
 */
export async function cacheDeleteMerchant(merchantId: string): Promise<void> {
  const redis = getRedis();
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `*:${merchantId}:*`, 'COUNT', 100);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    cursor = nextCursor;
  } while (cursor !== '0');
}
