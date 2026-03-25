import { Redis, RedisOptions } from 'ioredis';

// Support both REDIS_URL (Upstash/Railway) and individual host/port env vars
const redisUrl = process.env.REDIS_URL;

export const redisConnection: RedisOptions = redisUrl
  ? {
      // Parse from URL — used by Upstash, Railway, Render
      // ioredis accepts a full redis:// or rediss:// URL via the constructor,
      // but RedisOptions doesn't have a url field — pass options extracted below
      maxRetriesPerRequest: null,
      lazyConnect: true,
    }
  : {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: null,
      lazyConnect: true,
    };

// lazyConnect: true — don't actually connect until the first command is issued.
// This prevents ECONNREFUSED errors during Next.js build/static generation
// when Redis isn't available (Vercel build environment has no Redis).
export const bullmqConnection = redisUrl
  ? new Redis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true })
  : new Redis(redisConnection);
