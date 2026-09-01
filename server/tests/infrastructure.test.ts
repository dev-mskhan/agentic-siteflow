/**
 * Task 0.4 — Application Infrastructure tests
 *
 * Covers:
 *  0.4.2  Request ID propagation through logs / response headers
 *  0.4.3  CORS middleware (OPTIONS preflight)
 *  0.4.4  Rate-limit middleware (headers present)
 *  0.4.5  Standardized error response contract (404 and AppError shape)
 *  0.4.6  Middleware order / all expected headers on every response
 */

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app/index.js";
import { AppError } from "../src/common/AppError.js";
import type { Express } from "express";

// ── 0.4.2 Request ID propagation ────────────────────────────────────────────

describe("0.4.2 Request ID propagation", () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
  });

  it("sets x-request-id on every response (not just /health)", async () => {
    for (const path of ["/health", "/ready", "/does-not-exist"]) {
      const res = await request(app).get(path);
      expect(
        res.headers["x-request-id"],
        `x-request-id missing on ${path}`,
      ).toBeDefined();
    }
  });

  it("echoes a provided x-request-id on non-health routes", async () => {
    const id = "propagation-test-id-456";
    const res = await request(app).get("/does-not-exist").set("x-request-id", id);
    expect(res.headers["x-request-id"]).toBe(id);
  });

  it("generates a request ID when none is provided", async () => {
    const res = await request(app).get("/health");
    const requestId = res.headers["x-request-id"] as string;
    expect(typeof requestId).toBe("string");
    expect(requestId.length).toBeGreaterThan(0);
  });
});

// ── 0.4.3 CORS ───────────────────────────────────────────────────────────────

describe("0.4.3 CORS configuration", () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
  });

  it("responds to OPTIONS preflight on /health with CORS headers", async () => {
    const res = await request(app)
      .options("/health")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "GET");

    // 204 No Content or 200 OK are both valid preflight responses
    expect([200, 204]).toContain(res.status);
    expect(res.headers["access-control-allow-origin"]).toBeDefined();
  });

  it("includes Access-Control-Allow-Origin on regular GET requests", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:3000");

    expect(res.headers["access-control-allow-origin"]).toBeDefined();
  });

  it("CORS headers are present on 404 responses", async () => {
    const res = await request(app)
      .get("/unknown-route")
      .set("Origin", "http://localhost:3000");

    expect(res.headers["access-control-allow-origin"]).toBeDefined();
  });
});

// ── 0.4.4 Rate limiting ──────────────────────────────────────────────────────

describe("0.4.4 Rate-limit middleware", () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
  });

  it("includes RateLimit header on responses (draft-8 standard)", async () => {
    const res = await request(app).get("/health");
    // express-rate-limit draft-8 emits a 'ratelimit' header (not 'ratelimit-limit')
    expect(res.headers["ratelimit"]).toBeDefined();
  });

  it("includes X-RateLimit-Limit legacy header on responses", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-ratelimit-limit"]).toBeDefined();
  });

  it("rate limit header value matches configured RATE_LIMIT_MAX (default 100)", async () => {
    const res = await request(app).get("/health");
    // The header can be a number or a quoted number string; parse it
    const limit = parseInt(res.headers["x-ratelimit-limit"] as string, 10);
    expect(limit).toBe(100);
  });
});

// ── 0.4.5 API response/error contract ────────────────────────────────────────

describe("0.4.5 Standardized error response contract", () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
  });

  it("404 response has exact shape: { success: false, error: { code, message }, requestId }", async () => {
    const res = await request(app).get("/no-such-route");
    expect(res.status).toBe(404);
    const body = res.body as { success: false; error: { code: string; message: string }; requestId?: string };
    expect(body.success).toBe(false);
    expect(typeof body.error.code).toBe("string");
    expect(body.error.code).toBe("NOT_FOUND");
    expect(typeof body.error.message).toBe("string");
    expect(typeof body.requestId).toBe("string");
  });

  it("AppError response has exact shape: { success: false, error: { code, message }, requestId }", async () => {
    const { default: express } = await import("express");
    const { errorHandler } = await import("../src/middleware/errorHandler.js");
    const { requestIdMiddleware } = await import("../src/middleware/requestId.js");
    const { notFoundHandler } = await import("../src/middleware/notFound.js");

    const testApp = express();
    testApp.use(requestIdMiddleware);
    testApp.use(express.json());
    testApp.get("/test/contract", () => {
      throw new AppError("Contract test error", 422, "CONTRACT_ERROR");
    });
    testApp.use(notFoundHandler);
    testApp.use(errorHandler);

    const res = await request(testApp).get("/test/contract");
    expect(res.status).toBe(422);
    const body = res.body as { success: false; error: { code: string; message: string }; requestId?: string };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("CONTRACT_ERROR");
    expect(body.error.message).toBe("Contract test error");
    expect(typeof body.requestId).toBe("string");
  });

  it("error response body contains no extra top-level fields beyond success/error/requestId", async () => {
    const res = await request(app).get("/no-such-route-2");
    const body = res.body as Record<string, unknown>;
    const keys = Object.keys(body);
    for (const key of keys) {
      expect(["success", "error", "requestId"]).toContain(key);
    }
  });
});

// ── 0.4.6 Middleware order / expected headers on every response ──────────────

describe("0.4.6 Middleware order integration", () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
  });

  it("all expected headers are present on a /health response", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);

    // Request ID (middleware #2)
    expect(res.headers["x-request-id"]).toBeDefined();

    // Helmet security headers (middleware #3)
    expect(res.headers["x-content-type-options"]).toBeDefined();
    expect(res.headers["x-frame-options"]).toBeDefined();

    // Rate limit headers (middleware #6) — draft-8 uses 'ratelimit', legacy uses 'x-ratelimit-limit'
    expect(res.headers["x-ratelimit-limit"]).toBeDefined();
  });

  it("all expected headers are present on a 404 response", async () => {
    const res = await request(app).get("/nonexistent");

    // Request ID
    expect(res.headers["x-request-id"]).toBeDefined();

    // Helmet
    expect(res.headers["x-content-type-options"]).toBeDefined();

    // Rate limit
    expect(res.headers["x-ratelimit-limit"]).toBeDefined();
  });

  it("CORS runs before route handling — preflight for /trpc is handled", async () => {
    const res = await request(app)
      .options("/trpc/health.check")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "GET");

    expect([200, 204]).toContain(res.status);
    expect(res.headers["access-control-allow-origin"]).toBeDefined();
  });
});
