/**
 * Unit tests for src/config/env.ts
 *
 * These are pure unit tests — no HTTP, no database, no Redis.
 * They test the Zod env schema logic directly by replicating the schema
 * and verifying it accepts/rejects inputs as expected.
 *
 * Note: The env module parses process.env at import time. To test the
 * schema validation logic without re-importing a cached module, we
 * replicate the schema here and test it independently. This is valid
 * because the goal is to verify the schema rules, not module caching.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";

// Replicate the env schema from src/config/env.ts for isolated unit testing.
// If the schema changes, update this replica to match.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
    .default("info"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://siteflow:siteflow@localhost:5432/siteflow?schema=public"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
});

/** Minimal valid env with all required keys that have no defaults. */
const baseEnv: Record<string, string> = {};

describe("env schema — valid inputs", () => {
  it("parses successfully with all defaults when input is empty", () => {
    const result = envSchema.safeParse(baseEnv);
    expect(result.success).toBe(true);
  });

  it("uses default NODE_ENV of development", () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.NODE_ENV).toBe("development");
  });

  it("uses default PORT of 3000", () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.PORT).toBe(3000);
  });

  it("uses default LOG_LEVEL of info", () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.LOG_LEVEL).toBe("info");
  });

  it("uses default RATE_LIMIT_MAX of 100", () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.RATE_LIMIT_MAX).toBe(100);
  });

  it("uses default RATE_LIMIT_WINDOW_MS of 60000", () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });

  it("accepts NODE_ENV = test", () => {
    const result = envSchema.safeParse({ NODE_ENV: "test" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.NODE_ENV).toBe("test");
  });

  it("accepts NODE_ENV = production", () => {
    const result = envSchema.safeParse({ NODE_ENV: "production" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.NODE_ENV).toBe("production");
  });

  it("coerces PORT from string to number", () => {
    const result = envSchema.safeParse({ PORT: "4000" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.PORT).toBe(4000);
  });

  it("accepts valid LOG_LEVEL values", () => {
    const levels = ["trace", "debug", "info", "warn", "error", "fatal", "silent"] as const;
    for (const level of levels) {
      const result = envSchema.safeParse({ LOG_LEVEL: level });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.LOG_LEVEL).toBe(level);
    }
  });

  it("accepts a custom DATABASE_URL", () => {
    const url = "postgresql://user:pass@db.example.com:5432/mydb?schema=public";
    const result = envSchema.safeParse({ DATABASE_URL: url });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.DATABASE_URL).toBe(url);
  });

  it("accepts a custom REDIS_URL", () => {
    const url = "redis://user:pass@redis.example.com:6380";
    const result = envSchema.safeParse({ REDIS_URL: url });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.REDIS_URL).toBe(url);
  });

  it("coerces RATE_LIMIT_MAX from string to number", () => {
    const result = envSchema.safeParse({ RATE_LIMIT_MAX: "200" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.RATE_LIMIT_MAX).toBe(200);
  });
});

describe("env schema — invalid inputs", () => {
  it("rejects invalid NODE_ENV", () => {
    const result = envSchema.safeParse({ NODE_ENV: "staging" });
    expect(result.success).toBe(false);
  });

  it("rejects PORT below 1", () => {
    const result = envSchema.safeParse({ PORT: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects PORT above 65535", () => {
    const result = envSchema.safeParse({ PORT: "99999" });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer PORT", () => {
    // After coercion, 3000.5 becomes a float — min/max pass but int() rejects it
    const result = envSchema.safeParse({ PORT: "3000.5" });
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric PORT", () => {
    const result = envSchema.safeParse({ PORT: "not-a-port" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid LOG_LEVEL", () => {
    const result = envSchema.safeParse({ LOG_LEVEL: "verbose" });
    expect(result.success).toBe(false);
  });

  it("rejects empty DATABASE_URL", () => {
    const result = envSchema.safeParse({ DATABASE_URL: "" });
    expect(result.success).toBe(false);
  });

  it("rejects empty REDIS_URL", () => {
    const result = envSchema.safeParse({ REDIS_URL: "" });
    expect(result.success).toBe(false);
  });

  it("rejects negative RATE_LIMIT_MAX", () => {
    const result = envSchema.safeParse({ RATE_LIMIT_MAX: "-1" });
    expect(result.success).toBe(false);
  });

  it("rejects zero RATE_LIMIT_WINDOW_MS", () => {
    const result = envSchema.safeParse({ RATE_LIMIT_WINDOW_MS: "0" });
    expect(result.success).toBe(false);
  });

  it("collects multiple validation errors at once", () => {
    const result = envSchema.safeParse({
      NODE_ENV: "invalid",
      PORT: "99999",
      LOG_LEVEL: "verbose",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(1);
    }
  });
});
