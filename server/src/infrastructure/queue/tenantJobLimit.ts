import { redis } from "../redis/client.js";
import { env } from "../../config/index.js";
import { logger } from "../logger.js";

const KEY_PREFIX = "jobs:active";
const TTL_SECONDS = 3600; // safety expiry prevents stuck counters after crashes

export function jobCountKey(orgId: string): string {
  return `${KEY_PREFIX}:${orgId}`;
}

export async function canStartJob(orgId: string): Promise<boolean> {
  const limit = env.TENANT_JOB_CONCURRENCY_LIMIT;
  try {
    const raw = await redis.get(jobCountKey(orgId));
    return (raw ? parseInt(raw, 10) : 0) < limit;
  } catch (err) {
    logger.warn({ err, orgId }, "tenantJobLimit.canStartJob Redis error — allowing job");
    return true;
  }
}

export async function incrementJobCount(orgId: string): Promise<void> {
  try {
    const key = jobCountKey(orgId);
    await redis.incr(key);
    await redis.expire(key, TTL_SECONDS);
  } catch (err) {
    logger.warn({ err, orgId }, "tenantJobLimit.incrementJobCount Redis error");
  }
}

export async function decrementJobCount(orgId: string): Promise<void> {
  try {
    const key = jobCountKey(orgId);
    const newVal = await redis.decr(key);
    if (newVal < 0) {
      await redis.set(key, 0);
    }
  } catch (err) {
    logger.warn({ err, orgId }, "tenantJobLimit.decrementJobCount Redis error");
  }
}
