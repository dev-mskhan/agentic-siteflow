import type { RequestHandler } from "express";
import { redis } from "../infrastructure/redis/client.js";
import { env } from "../config/index.js";
import { logger } from "../infrastructure/logger.js";

/**
 * Per-tenant rate limiting middleware.
 *
 * Applied only to authenticated requests (those with a Bearer JWT).
 * Unauthenticated requests fall through to the global express-rate-limit only.
 *
 * Uses a fixed-window Redis counter per orgId.
 * Key format: rl:tenant:{orgId}:{windowStart}
 * TTL is set to the window duration so keys expire automatically.
 *
 * Degrades gracefully on Redis failure — the limit is skipped, not enforced.
 */
export function createTenantRateLimitMiddleware(): RequestHandler {
  const windowMs = env.TENANT_RATE_LIMIT_WINDOW_MS;
  const max = env.TENANT_RATE_LIMIT_MAX;

  return async (req, res, next) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader?.startsWith("Bearer ")) return next();

    let orgId: string | undefined;
    try {
      const token = authHeader.slice(7);
      const parts = token.split(".");
      if (parts[1]) {
        const payload = JSON.parse(
          Buffer.from(parts[1], "base64url").toString(),
        ) as { orgId?: string };
        orgId = payload.orgId;
      }
    } catch {
      return next();
    }

    if (!orgId) return next();

    const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
    const key = `rl:tenant:${orgId}:${windowStart}`;

    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.pexpire(key, windowMs);
      }

      const retryAfterMs = windowStart + windowMs - Date.now();

      if (count > max) {
        res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000).toString());
        res.setHeader("X-Tenant-RateLimit-Limit", max.toString());
        res.setHeader("X-Tenant-RateLimit-Remaining", "0");
        res.status(429).json({
          success: false,
          error: {
            code: "TENANT_RATE_LIMIT_EXCEEDED",
            message: "Organization request rate limit exceeded. Try again later.",
          },
        });
        return;
      }

      res.setHeader("X-Tenant-RateLimit-Limit", max.toString());
      res.setHeader("X-Tenant-RateLimit-Remaining", Math.max(0, max - count).toString());
    } catch (err) {
      logger.warn({ err, orgId }, "Tenant rate limit Redis error — skipping limit");
    }

    return next();
  };
}
