import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { FinancialVarianceService } from "../../src/modules/commercial/financial-variance.service.js";
import { NotFoundError } from "../../src/common/AppError.js";

describe("FinancialVarianceService", () => {
  let service: FinancialVarianceService;
  let mockVarianceRepo: any;
  let mockProjectRepo: any;

  beforeEach(() => {
    mockVarianceRepo = {
      getProjectBudgetItems: vi.fn(),
      getProjectCommittedCosts: vi.fn(),
      getProjectActualCosts: vi.fn(),
      listOrgProjects: vi.fn(),
    };

    mockProjectRepo = {
      findById: vi.fn(),
    };

    service = new FinancialVarianceService(mockVarianceRepo, mockProjectRepo);
  });

  describe("getProjectCommercialOverview", () => {
    it("should throw NotFoundError if project does not exist", async () => {
      mockProjectRepo.findById.mockResolvedValue(null);

      await expect(
        service.getProjectCommercialOverview("org-1", "proj-1"),
      ).rejects.toThrow(NotFoundError);
    });

    it("should accurately compute FAC and positive variance when under budget", async () => {
      mockProjectRepo.findById.mockResolvedValue({
        id: "proj-1",
        name: "Building A",
        currency: "USD",
        plannedStartDate: new Date("2026-01-01"),
      });

      // Budget for code-1 = 10,000
      mockVarianceRepo.getProjectBudgetItems.mockResolvedValue([
        {
          costCodeId: "code-1",
          originalAmount: new Prisma.Decimal(10000),
          approvedChanges: new Prisma.Decimal(0),
          revisedAmount: new Prisma.Decimal(10000),
          costCode: { code: "03-300", name: "Cast-in-Place Concrete", category: "Concrete" },
        },
      ]);

      // PO commitment = 8,000
      mockVarianceRepo.getProjectCommittedCosts.mockResolvedValue({
        pos: [{ costCodeId: "code-1", totalPrice: new Prisma.Decimal(8000) }],
        contracts: [],
      });

      // Actual spent = 3,000
      mockVarianceRepo.getProjectActualCosts.mockResolvedValue([
        { costCodeId: "code-1", amount: new Prisma.Decimal(3000) },
      ]);

      const overview = await service.getProjectCommercialOverview("org-1", "proj-1");

      expect(overview.totalRevisedBudget).toBe(10000);
      expect(overview.totalCommittedCost).toBe(8000);
      expect(overview.totalActualCost).toBe(3000);
      // FAC = actual (3000) + max(0, committed (8000) - actual (3000)) = 3000 + 5000 = 8000
      expect(overview.totalForecastCost).toBe(8000);
      // Variance = revisedBudget (10000) - FAC (8000) = 2000
      expect(overview.totalVariance).toBe(2000);
      expect(overview.isOverBudget).toBe(false);
    });

    it("should identify over-budget conditions when actuals exceed budget", async () => {
      mockProjectRepo.findById.mockResolvedValue({
        id: "proj-1",
        name: "Building B",
        currency: "USD",
      });

      // Budget for code-1 = 5,000
      mockVarianceRepo.getProjectBudgetItems.mockResolvedValue([
        {
          costCodeId: "code-1",
          originalAmount: new Prisma.Decimal(5000),
          approvedChanges: new Prisma.Decimal(0),
          revisedAmount: new Prisma.Decimal(5000),
          costCode: { code: "09-200", name: "Plaster & Gypsum Board", category: "Finishes" },
        },
      ]);

      mockVarianceRepo.getProjectCommittedCosts.mockResolvedValue({
        pos: [],
        contracts: [],
      });

      // Actual spent = 6,500
      mockVarianceRepo.getProjectActualCosts.mockResolvedValue([
        { costCodeId: "code-1", amount: new Prisma.Decimal(6500) },
      ]);

      const overview = await service.getProjectCommercialOverview("org-1", "proj-1");

      expect(overview.totalRevisedBudget).toBe(5000);
      expect(overview.totalActualCost).toBe(6500);
      expect(overview.totalForecastCost).toBe(6500);
      // Variance = 5000 - 6500 = -1500
      expect(overview.totalVariance).toBe(-1500);
      expect(overview.isOverBudget).toBe(true);
      expect(overview.costCodeBreakdown[0].isOverBudget).toBe(true);
    });
  });
});
