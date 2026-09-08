import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Redis mock ───────────────────────────────────────────────────────────────

const mockGet = vi.fn();
const mockIncr = vi.fn().mockResolvedValue(1);
const mockExpire = vi.fn().mockResolvedValue(1);
const mockDecr = vi.fn().mockResolvedValue(0);
const mockSet = vi.fn().mockResolvedValue("OK");

vi.mock("../../src/infrastructure/redis/client.js", () => ({
  redis: {
    get: mockGet,
    incr: mockIncr,
    expire: mockExpire,
    decr: mockDecr,
    set: mockSet,
  },
}));

vi.mock("../../src/config/index.js", () => ({
  env: {
    TENANT_JOB_CONCURRENCY_LIMIT: 5,
    REDIS_URL: "redis://localhost:6379",
    NODE_ENV: "test",
    LOG_LEVEL: "info",
  },
}));

vi.mock("../../src/infrastructure/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const { canStartJob, incrementJobCount, decrementJobCount } = await import(
  "../../src/infrastructure/queue/tenantJobLimit.js"
);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("tenantJobLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIncr.mockResolvedValue(1);
    mockDecr.mockResolvedValue(0);
  });

  describe("canStartJob", () => {
    it("returns true when active job count is below the limit", async () => {
      mockGet.mockResolvedValue("3"); // count 3 < limit 5
      const result = await canStartJob("org_1");
      expect(result).toBe(true);
    });

    it("returns false when active job count equals the limit", async () => {
      mockGet.mockResolvedValue("5"); // count 5 >= limit 5
      const result = await canStartJob("org_1");
      expect(result).toBe(false);
    });

    it("returns true on Redis error (fail-open)", async () => {
      mockGet.mockRejectedValue(new Error("Redis down"));
      const result = await canStartJob("org_1");
      expect(result).toBe(true);
    });
  });

  describe("incrementJobCount", () => {
    it("calls redis.incr and redis.expire with the correct key", async () => {
      mockIncr.mockResolvedValue(1);
      mockExpire.mockResolvedValue(1);

      await incrementJobCount("org_1");

      expect(mockIncr).toHaveBeenCalledWith("jobs:active:org_1");
      expect(mockExpire).toHaveBeenCalledWith("jobs:active:org_1", expect.any(Number));
    });
  });

  describe("decrementJobCount", () => {
    it("decrements counter when decr returns a positive value (no clamp needed)", async () => {
      mockDecr.mockResolvedValue(2); // still positive, no set needed

      await decrementJobCount("org_1");

      expect(mockDecr).toHaveBeenCalledWith("jobs:active:org_1");
      expect(mockSet).not.toHaveBeenCalled();
    });

    it("clamps to 0 when decr returns a negative value", async () => {
      mockDecr.mockResolvedValue(-1); // underflow — must clamp

      await decrementJobCount("org_1");

      expect(mockDecr).toHaveBeenCalledWith("jobs:active:org_1");
      expect(mockSet).toHaveBeenCalledWith("jobs:active:org_1", 0);
    });
  });
});
