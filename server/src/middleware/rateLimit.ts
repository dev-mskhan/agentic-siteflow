import { rateLimit } from "express-rate-limit";
import type { RequestHandler } from "express";
import { env } from "../config/index.js";

/**
 * Rate-limit middleware.
 *
 * Uses `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX` from env config.
 * Adds `RateLimit-*` and legacy `X-RateLimit-*` headers to every response.
 */
export const rateLimitMiddleware: RequestHandler = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: "draft-8", // RateLimit-* headers (RFC 6585 draft-8)
  legacyHeaders: true, // X-RateLimit-* headers for backwards compatibility
  message: {
    success: false,
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests, please try again later.",
    },
  },
});
