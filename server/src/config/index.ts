import type { Logger } from 'pino';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type { ObjectStorage } from './s3';
import type { Env } from './env';
import { createStandaloneLogger } from './logger';
import { createPgPool, checkPostgres } from './postgres';
import { createRedis, checkRedis } from './redis';
import { createObjectStorage } from './s3';

export interface ReadyCheck {
  name: string;
  check: () => Promise<void>;
}

export interface Infra {
  logger: Logger;
  pg: Pool;
  redis: Redis;
  s3: ObjectStorage;
  readyChecks: ReadyCheck[];
  close: () => Promise<void>;
}

export async function setupInfra(env: Env, logger: Logger | undefined = undefined): Promise<Infra> {
  const resolvedLogger = logger ?? createStandaloneLogger(env);
  const pg = createPgPool(env);
  const redis = createRedis(env);
  const s3 = createObjectStorage(env);

  const readyChecks: ReadyCheck[] = [
    {
      name: 'postgres',
      check: () => checkPostgres(pg),
    },
    {
      name: 'redis',
      check: () => checkRedis(redis),
    },
    {
      name: 's3',
      check: async () => s3.check(),
    },
  ];

  for (const check of readyChecks) {
    await check.check();
    resolvedLogger.info({ dependency: check.name }, 'dependency reachable');
  }

  return {
    logger: resolvedLogger,
    pg,
    redis,
    s3,
    readyChecks,
    async close() {
      await Promise.allSettled([pg.end(), redis.quit(), redis.disconnect()]);
      resolvedLogger.info('infrastructure disconnected');
    },
  };
}
