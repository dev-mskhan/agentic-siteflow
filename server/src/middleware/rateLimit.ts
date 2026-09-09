import { rateLimit } from "express-rate-limit";
import type { RequestHandler } from "express";
import { env } from "../config/index.js";

/**
 * Rate-limit middleware factory.
 *
 * Uses `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX` from env config.
 * Adds `RateLimit-*` and legacy `X-RateLimit-*` headers to every response.
 *
 * Store strategy:
 *  - When Redis is available and connected: uses rate-limit-redis backed by
 *    the shared ioredis singleton, namespaced under `rl:global:`.
 *  - When Redis is unavailable (ioredis not yet connected, or in test env):
 *    falls back silently to the default in-memory MemoryStore.
 *
 * The store is resolved at call time (first request) rather than at module
 * load time to avoid rate-limit-redis firing SCRIPT LOAD commands against
 * an ioredis client that has `enableOfflineQueue: false` and has not yet
 * established its connection.
 */
function buildRateLimitMiddleware(): RequestHandler {
  // We import and construct the RedisStore lazily inside the middleware
  // factory to keep the module free of side-effects at load time.
  let redisStoreMiddleware: RequestHandler | null = null;

  async function getOrBuildMiddleware(): Promise<RequestHandler> {
    if (redisStoreMiddleware) return redisStoreMiddleware;

    try {
      // Dynamic import avoids SCRIPT LOAD at module load time
      const { redis } = await import("../infrastructure/redis/client.js");
      const { RedisStore } = await import("rate-limit-redis");
      type RedisReply = import("rate-limit-redis").RedisReply;

      // Only attach the Redis store if the connection is already established.
      // ioredis status is one of: wait, reconnecting, connecting, connect, ready, close, end
      if (redis.status !== "ready") {
        return buildMemoryMiddleware();
      }

      const store = new RedisStore({
        sendCommand: (...args: string[]) =>
          redis.call(...(args as [string, ...string[]])) as Promise<RedisReply>,
        prefix: "rl:global:",
      });

      redisStoreMiddleware = rateLimit({
        windowMs: env.RATE_LIMIT_WINDOW_MS,
        max: env.RATE_LIMIT_MAX,
        standardHeaders: "draft-8",
        legacyHeaders: true,
        store,
        message: {
          success: false,
          error: {
            code: "TOO_MANY_REQUESTS",
            message: "Too many requests, please try again later.",
          },
        },
      });

      return redisStoreMiddleware;
    } catch {
      // Redis unavailable — fall back to memory store
      return buildMemoryMiddleware();
    }
  }

  return (req, res, next) => {
    // Resolve the correct middleware on each request until Redis is ready,
    // then cache the Redis-backed instance for all subsequent requests.
    getOrBuildMiddleware()
      .then((mw) => mw(req, res, next))
      .catch(next);
  };
}

function buildMemoryMiddleware(): RequestHandler {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: true,
    message: {
      success: false,
      error: {
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests, please try again later.",
      },
    },
  });
}

export const rateLimitMiddleware: RequestHandler = buildRateLimitMiddleware();
