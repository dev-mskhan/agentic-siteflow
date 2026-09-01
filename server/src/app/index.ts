// Config must be the first import so invalid env crashes before any setup.
import { env } from "../config/index.js";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import type { IncomingMessage } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { logger } from "../infrastructure/logger.js";
import { requestIdMiddleware } from "../middleware/requestId.js";
import { createCorsMiddleware } from "../middleware/cors.js";
import { rateLimitMiddleware } from "../middleware/rateLimit.js";
import { notFoundHandler } from "../middleware/notFound.js";
import { errorHandler } from "../middleware/errorHandler.js";
import { healthRouter } from "../routes/health.js";
import { readyRouter } from "../routes/ready.js";
import { appRouter } from "../api/trpc/router.js";
import { createContext } from "../api/trpc/context.js";

/**
 * Application factory.
 * Creates and configures the Express application.
 * Separated from server bootstrap so it can be imported in tests.
 *
 * Middleware chain order:
 *  1. CORS                   — must be first to handle preflight before any auth/security
 *  2. Request ID             — attach/propagate request ID early
 *  3. Security headers       — helmet sets Content-Security-Policy, X-Frame-Options, etc.
 *  4. Request logging        — pino-http, after request ID so logs carry the ID
 *  5. Body parsing           — JSON + urlencoded
 *  6. Rate limiting          — applied after body parsing, before route handlers
 *  7. Application routes     — /health, /ready
 *  8. tRPC                   — /trpc router
 *  9. 404 handler            — catch unmatched routes
 * 10. Error handler          — global typed error handler (must be last)
 */
export function createApp(): express.Application {
  const app = express();

  // ── 1. CORS ────────────────────────────────────────────────────────────────
  app.use(createCorsMiddleware());

  // ── 2. Request ID ──────────────────────────────────────────────────────────
  app.use(requestIdMiddleware);

  // ── 3. Security headers ────────────────────────────────────────────────────
  app.use(helmet());

  // ── 4. Structured request logging ─────────────────────────────────────────
  app.use(
    pinoHttp({
      logger,
      customProps(req: IncomingMessage) {
        return {
          // Request ID is already set on the header by requestIdMiddleware
          requestId: req.headers["x-request-id"],
        };
      },
      autoLogging: {
        ignore(req: IncomingMessage) {
          return req.url === "/health" || req.url === "/ready";
        },
      },
    }),
  );

  // ── 5. Body parsing ────────────────────────────────────────────────────────
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // ── 6. Rate limiting ───────────────────────────────────────────────────────
  app.use(rateLimitMiddleware);

  // ── 7. Application routes ──────────────────────────────────────────────────
  app.use(healthRouter);
  app.use(readyRouter);

  // ── 8. tRPC ────────────────────────────────────────────────────────────────
  app.use(
    "/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // ── 9. 404 handler (after all routes) ─────────────────────────────────────
  app.use(notFoundHandler);

  // ── 10. Global error handler (must be last) ───────────────────────────────
  app.use(errorHandler);

  // Suppress unused-variable warning — env is imported for side-effect (fail-fast validation)
  void env;

  return app;
}
