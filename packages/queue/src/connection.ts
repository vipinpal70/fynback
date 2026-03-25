import { Redis } from 'ioredis';

// lazyConnect: true — connect only when the first command is issued,
// not at module import time. Prevents crashes during Next.js build.
export const bullmqConnection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

export const redisConnection = bullmqConnection.options;
