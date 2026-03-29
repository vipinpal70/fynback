import { Redis } from 'ioredis';

/**
 * BullMQ Redis connection.
 *
 * Supports two config styles — whichever env vars are present:
 *   REDIS_URL  → full connection URL (e.g. Upstash: rediss://default:password@host:6380)
 *   REDIS_HOST + REDIS_PORT → separate host/port (e.g. local Redis: 127.0.0.1:6379)
 *
 * lazyConnect: true — connect only when the first command is issued,
 * not at module import time. Prevents crashes during Next.js build.
 */

const redisUrl = process.env.REDIS_URL;
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
const redisPassword = process.env.REDIS_PASSWORD || undefined;

export const bullmqConnection = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    })
  : new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });

export const redisConnection = bullmqConnection.options;
