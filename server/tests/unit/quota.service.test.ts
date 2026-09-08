/**
 * Unit tests for QuotaService.
 * Verifies quota enforcement, AI quota bypass, clamping on decrement,
 * and correct status reporting.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenError } from "../../src/common/AppError.js";

const mockFindUnique = vi.fn();
const mockUpdateMany = vi.fn();
const mockUpdate = vi.fn();
const mockCreateMany = vi.fn();

vi.mock("../../src/infrastructure/database/client.js", () => ({
  db: {
    tenantQuota: {
      findUnique: mockFindUnique,
      updateMany: mockUpdateMany,
      update: mockUpdate,
      createMany: mockCreateMany,
    },
  },
}));

const { QuotaService } = await import("../../src/modules/auth/quota.service.js");

describe("QuotaService", () => {
  let service: InstanceType<typeof QuotaService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new QuotaService();
  });

  // ── assertQuota ─────────────────────────────────────────────────────────────

  describe("assertQuota", () => {
    it("does not throw when usage is under the limit (used=5, limit=10, amount=1)", async () => {
      mockFindUnique.mockResolvedValue({ currentUsage: 5, limitValue: 10 });

      await expect(
        service.assertQuota("org_1", "PROJECTS", 1),
      ).resolves.toBeUndefined();
    });

    it("throws ForbiddenError when usage exactly equals the limit (used=10, limit=10, amount=1)", async () => {
      mockFindUnique.mockResolvedValue({ currentUsage: 10, limitValue: 10 });

      await expect(
        service.assertQuota("org_1", "PROJECTS", 1),
      ).rejects.toThrow(ForbiddenError);
    });

    it("throws ForbiddenError when requested amount would push over the limit (used=9, limit=10, amount=2)", async () => {
      mockFindUnique.mockResolvedValue({ currentUsage: 9, limitValue: 10 });

      await expect(
        service.assertQuota("org_1", "PROJECTS", 2),
      ).rejects.toThrow(ForbiddenError);
    });

    it("never throws for AI_TOKENS_DAILY regardless of usage", async () => {
      // Even if the DB would say limit exceeded, AI quotas are skipped
      mockFindUnique.mockResolvedValue({ currentUsage: 1000, limitValue: 0 });

      await expect(
        service.assertQuota("org_1", "AI_TOKENS_DAILY", 1),
      ).resolves.toBeUndefined();

      // DB should not be hit at all — early return before any lookup
      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it("never throws for AI_REQUESTS_DAILY regardless of usage", async () => {
      mockFindUnique.mockResolvedValue({ currentUsage: 999, limitValue: 0 });

      await expect(
        service.assertQuota("org_1", "AI_REQUESTS_DAILY", 999),
      ).resolves.toBeUndefined();

      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it("does not throw when no quota record exists (findUnique returns null → both 0)", async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(
        service.assertQuota("org_1", "PROJECTS", 1),
      ).resolves.toBeUndefined();
    });
  });

  // ── getQuotaStatus ───────────────────────────────────────────────────────────

  describe("getQuotaStatus", () => {
    it("returns { used: 5, limit: 10, remaining: 5 } for a record with currentUsage=5, limitValue=10", async () => {
      mockFindUnique.mockResolvedValue({ currentUsage: 5, limitValue: 10 });

      const status = await service.getQuotaStatus("org_1", "PROJECTS");

      expect(status).toEqual({ used: 5, limit: 10, remaining: 5 });
    });
  });

  // ── decrementUsage ───────────────────────────────────────────────────────────

  describe("decrementUsage", () => {
    it("clamps to 0 and never passes a negative currentUsage to db.update when currentUsage is already 0", async () => {
      mockFindUnique.mockResolvedValue({ currentUsage: 0 });
      mockUpdate.mockResolvedValue({});

      await service.decrementUsage("org_1", "PROJECTS", 1);

      expect(mockUpdate).toHaveBeenCalledOnce();
      const callArg = mockUpdate.mock.calls[0]![0] as {
        data: { currentUsage: number };
      };
      expect(callArg.data.currentUsage).toBe(0);
    });
  });
});
