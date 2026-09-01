import cors from "cors";
import type { RequestHandler } from "express";
import { env } from "../config/index.js";

/**
 * CORS middleware factory.
 *
 * Reads `CORS_ORIGINS` from env config (comma-separated list).
 * - In production: only listed origins are permitted.
 * - In development/test: all origins are permitted (simplifies local development).
 */
export function createCorsMiddleware(): RequestHandler {
  const allowedOrigins = env.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (env.NODE_ENV === "production") {
    return cors({
      origin: allowedOrigins,
      methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
      credentials: true,
    }) as RequestHandler;
  }

  // Development / test: allow all origins for convenience
  return cors({
    origin: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
    credentials: true,
  }) as RequestHandler;
}
