import { Redis, RedisOptions } from 'ioredis';

export const createRedisClient = (options: RedisOptions) => {
  return new Redis(options);
};

export * from 'ioredis';
