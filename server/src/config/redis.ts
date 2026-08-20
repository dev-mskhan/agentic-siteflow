import { Redis } from 'ioredis';
import type { Env } from './env';

export function createRedis(env: Env): Redis {
  return new Redis(env.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
}

export async function checkRedis(redis: Redis): Promise<void> {
  const pong = await redis.ping();
  if (pong !== 'PONG') {
    throw new Error(`Redis PING returned unexpected result: ${String(pong)}`);
  }
}
