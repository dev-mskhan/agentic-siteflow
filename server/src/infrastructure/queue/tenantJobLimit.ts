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
    if (typeof redis.eval === "function") {
      const result = await redis.eval(
        "local current = tonumber(redis.call('GET', KEYS[1]) or '0') if current >= tonumber(ARGV[1]) then return 0 end redis.call('INCR', KEYS[1]) redis.call('EXPIRE', KEYS[1], ARGV[2]) return 1",
        1,
        jobCountKey(orgId),
        limit,
        TTL_SECONDS,
      );
      return result === 1;
    }
    const raw = await redis.get(jobCountKey(orgId));
    return (raw ? parseInt(raw, 10) : 0) < limit;
  } catch (err) {
    logger.warn({ err, orgId }, "tenantJobLimit.canStartJob Redis error — allowing job");
    return true;
  }
}

export async function incrementJobCount(orgId: string): Promise<void> {
  try {
    if (typeof redis.eval === "function") return;
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
    if (typeof redis.eval === "function") {
      await redis.eval(
        "local current = tonumber(redis.call('GET', KEYS[1]) or '0') if current <= 1 then redis.call('DEL', KEYS[1]) else redis.call('DECR', KEYS[1]) end return 1",
        1,
        key,
      );
      return;
    }
    const newVal = await redis.decr(key);
    if (newVal < 0) {
      await redis.set(key, 0);
    }
  } catch (err) {
    logger.warn({ err, orgId }, "tenantJobLimit.decrementJobCount Redis error");
  }
}
