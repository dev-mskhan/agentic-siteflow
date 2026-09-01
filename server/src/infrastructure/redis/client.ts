import { Redis } from "ioredis";
import { env } from "../../config/index.js";
import { logger } from "../logger.js";

/**
 * Singleton ioredis client.
 *
 * Connection errors are logged as warnings — they do NOT crash the process.
 * The server starts successfully regardless of Redis availability;
 * the /ready endpoint reflects the actual connectivity state.
 */
const redis = new Redis(env.REDIS_URL, {
  // Disable ioredis auto-reconnect retries on first connect so the process
  // does not hang during startup when Redis is unavailable.
  maxRetriesPerRequest: null,
  // Suppress the unhandled-rejection that ioredis emits when it cannot
  // connect on first attempt — the "error" event below handles it.
  enableOfflineQueue: false,
  lazyConnect: true,
});

redis.on("connect", () => {
  logger.info("Redis connected");
});

redis.on("ready", () => {
  logger.info("Redis ready");
});

redis.on("error", (err: unknown) => {
  // Log as a warning so the server remains operational in a degraded state.
  logger.warn({ err }, "Redis connection error");
});

redis.on("close", () => {
  logger.info("Redis connection closed");
});

redis.on("reconnecting", () => {
  logger.info("Redis reconnecting");
});

// Initiate the connection in the background — failures are caught by the
// "error" event listener above and will not crash the process.
redis.connect().catch(() => {
  // Error is already handled by the "error" event listener.
});

/**
 * Gracefully disconnect the Redis client.
 * Call this during server shutdown (SIGINT / SIGTERM).
 */
async function disconnectRedis(): Promise<void> {
  await redis.quit();
}

export { redis, disconnectRedis };
