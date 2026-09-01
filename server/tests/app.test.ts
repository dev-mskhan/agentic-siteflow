/**
 * Integration tests — Task 0.1 / 0.5
 *
 * These are integration tests: they create a real Express application instance
 * and exercise it over HTTP using supertest. They do NOT require a live
 * database or Redis — the /ready endpoint gracefully accepts 200 or 503.
 *
 * Test database strategy: tests run against `siteflow_test` (see tests/setup.ts).
 * See tests/README.md for the full test organization and strategy.
 */
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app/index.js";
import { AppError } from "../src/common/AppError.js";
import type { Express } from "express";

interface HealthBody {
  status: string;
}

interface ReadyBody {
  status: string;
  checks: Record<string, unknown>;
}

interface ErrorBody {
  success: false;
  error: { code: string; message: string };
  requestId?: string;
}

describe("App factory", () => {
  it("creates an Express application without throwing", () => {
    expect(() => createApp()).not.toThrow();
  });

  it("returns an object with a listen method", () => {
    const app = createApp();
    expect(typeof app.listen).toBe("function");
  });
});

describe("GET /health", () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
  });

  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    const body = res.body as HealthBody;
    expect(body).toEqual({ status: "ok" });
  });

  it("sets x-request-id header on the response", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-request-id"]).toBeDefined();
  });

  it("echoes a provided x-request-id header", async () => {
    const id = "test-request-id-123";
    const res = await request(app).get("/health").set("x-request-id", id);
    expect(res.headers["x-request-id"]).toBe(id);
  });
});

describe("GET /ready", () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
  });

  it("returns a valid readiness response (200 ok or 503 degraded)", async () => {
    const res = await request(app).get("/ready");
    // When DB is running: 200 with status "ok"
    // When DB is not running: 503 with status "degraded"
    expect([200, 503]).toContain(res.status);
    const body = res.body as ReadyBody;
    expect(["ok", "degraded"]).toContain(body.status);
  });

  it("includes a checks object with database and redis keys", async () => {
    const res = await request(app).get("/ready");
    const body = res.body as ReadyBody;
    expect(body).toHaveProperty("checks");
    expect(typeof body.checks).toBe("object");
    expect(body.checks).toHaveProperty("database");
    expect(body.checks).toHaveProperty("redis");
    expect(["ok", "unavailable"]).toContain(body.checks["database"]);
    expect(["ok", "unavailable"]).toContain(body.checks["redis"]);
  });

  it("returns 200 when all checks pass, or 503 degraded when any check fails", async () => {
    const res = await request(app).get("/ready");
    const body = res.body as ReadyBody;

    if (res.status === 200) {
      expect(body.status).toBe("ok");
      expect(body.checks["database"]).toBe("ok");
      expect(body.checks["redis"]).toBe("ok");
    } else {
      expect(res.status).toBe(503);
      expect(body.status).toBe("degraded");
      // At least one check must be unavailable
      const checks = [body.checks["database"], body.checks["redis"]];
      expect(checks).toContain("unavailable");
    }
  });
});

describe("404 handler", () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
  });

  it("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("returns a structured error body", async () => {
    const res = await request(app).get("/does-not-exist");
    const body = res.body as ErrorBody;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(typeof body.error.message).toBe("string");
  });

  it("returns 404 for unknown nested routes", async () => {
    const res = await request(app).post("/api/v1/unknown");
    expect(res.status).toBe(404);
  });
});

describe("Global error handler", () => {
  it("handles AppError and returns structured response", async () => {
    // Create a fresh app, add test route BEFORE calling createApp would add its 404/error handlers.
    // We build a minimal express app that shares the same error handler.
    const { default: express } = await import("express");
    const { errorHandler } = await import("../src/middleware/errorHandler.js");
    const { requestIdMiddleware } = await import("../src/middleware/requestId.js");
    const { notFoundHandler } = await import("../src/middleware/notFound.js");

    const testApp = express();
    testApp.use(requestIdMiddleware);
    testApp.use(express.json());
    testApp.get("/test/app-error", () => {
      throw new AppError("Test application error", 422, "TEST_ERROR");
    });
    testApp.use(notFoundHandler);
    testApp.use(errorHandler);

    const res = await request(testApp).get("/test/app-error");
    expect(res.status).toBe(422);
    const body = res.body as ErrorBody;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("TEST_ERROR");
    expect(body.error.message).toBe("Test application error");
  });

  it("handles unknown errors with 500 and no internal details", async () => {
    const { default: express } = await import("express");
    const { errorHandler } = await import("../src/middleware/errorHandler.js");
    const { requestIdMiddleware } = await import("../src/middleware/requestId.js");
    const { notFoundHandler } = await import("../src/middleware/notFound.js");

    const testApp = express();
    testApp.use(requestIdMiddleware);
    testApp.use(express.json());
    testApp.get("/test/unknown-error", () => {
      throw new Error("Raw internal error - must not be exposed");
    });
    testApp.use(notFoundHandler);
    testApp.use(errorHandler);

    const res = await request(testApp).get("/test/unknown-error");
    expect(res.status).toBe(500);
    const body = res.body as ErrorBody;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    // Internal message must NOT be leaked
    expect(body.error.message).not.toContain("Raw internal error");
  });
});
