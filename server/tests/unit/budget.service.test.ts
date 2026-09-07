import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { BudgetService } from "../../src/modules/commercial/budget.service.js";
import { NotFoundError, ValidationError } from "../../src/common/AppError.js";

describe("BudgetService", () => {
  let budgetService: BudgetService;
  let mockBudgetRepo: any;
  let mockProjectRepo: any;
  let mockAudit: any;

  beforeEach(() => {
    mockBudgetRepo = {
      upsertBudgetItems: vi.fn(),
      listByProject: vi.fn(),
      findById: vi.fn(),
      updateItem: vi.fn(),
    };

    mockProjectRepo = {
      findById: vi.fn(),
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    budgetService = new BudgetService(mockBudgetRepo, mockProjectRepo, mockAudit);
  });

  describe("setBudget", () => {
    it("should reject if project does not exist", async () => {
      mockProjectRepo.findById.mockResolvedValue(null);

      await expect(
        budgetService.setBudget("org-1", "user-1", {
          projectId: "proj-1",
          items: [{ costCodeId: "code-1", originalAmount: 1000 }],
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should reject if any item has negative originalAmount", async () => {
      mockProjectRepo.findById.mockResolvedValue({ id: "proj-1", orgId: "org-1" });

      await expect(
        budgetService.setBudget("org-1", "user-1", {
          projectId: "proj-1",
          items: [{ costCodeId: "code-1", originalAmount: -50 }],
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("should upsert budget items and record audit log on success", async () => {
      mockProjectRepo.findById.mockResolvedValue({ id: "proj-1", orgId: "org-1" });
      const createdItems = [
        {
          id: "item-1",
          orgId: "org-1",
          projectId: "proj-1",
          costCodeId: "code-1",
          originalAmount: new Prisma.Decimal(1000),
          approvedChanges: new Prisma.Decimal(0),
          revisedAmount: new Prisma.Decimal(1000),
        },
      ];
      mockBudgetRepo.upsertBudgetItems.mockResolvedValue(createdItems);

      const res = await budgetService.setBudget("org-1", "user-1", {
        projectId: "proj-1",
        items: [{ costCodeId: "code-1", originalAmount: 1000 }],
      });

      expect(res).toEqual(createdItems);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "BUDGET_INITIALIZED",
          entity: "ProjectBudget",
          entityId: "proj-1",
        }),
      );
    });
  });

  describe("getProjectBudget", () => {
    it("should calculate totals and variance accurately against project budget", async () => {
      mockProjectRepo.findById.mockResolvedValue({
        id: "proj-1",
        budget: new Prisma.Decimal(5000),
      });
      mockBudgetRepo.listByProject.mockResolvedValue([
        {
          id: "b-1",
          originalAmount: new Prisma.Decimal(2000),
          approvedChanges: new Prisma.Decimal(500),
          revisedAmount: new Prisma.Decimal(2500),
        },
        {
          id: "b-2",
          originalAmount: new Prisma.Decimal(1500),
          approvedChanges: new Prisma.Decimal(0),
          revisedAmount: new Prisma.Decimal(1500),
        },
      ]);

      const summary = await budgetService.getProjectBudget("org-1", "proj-1");

      expect(summary.totalOriginalAmount).toBe(3500);
      expect(summary.totalApprovedChanges).toBe(500);
      expect(summary.totalRevisedAmount).toBe(4000);
      expect(summary.projectBudget).toBe(5000);
      expect(summary.varianceToProjectBudget).toBe(1000); // 5000 - 4000
      expect(summary.isAllocatedUnderBudget).toBe(true);
    });
  });

  describe("updateBudgetItem", () => {
    it("should update budget item and log audit trail", async () => {
      const existing = {
        id: "item-1",
        orgId: "org-1",
        originalAmount: new Prisma.Decimal(1000),
        approvedChanges: new Prisma.Decimal(200),
        revisedAmount: new Prisma.Decimal(1200),
        notes: "old note",
      };
      mockBudgetRepo.findById.mockResolvedValue(existing);
      mockBudgetRepo.updateItem.mockResolvedValue({
        ...existing,
        originalAmount: new Prisma.Decimal(1500),
        revisedAmount: new Prisma.Decimal(1700),
        notes: "new note",
      });

      const res = await budgetService.updateBudgetItem("org-1", "user-1", "item-1", {
        originalAmount: 1500,
        notes: "new note",
      });

      expect(Number(res.originalAmount)).toBe(1500);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "BUDGET_ITEM_UPDATED",
          entity: "BudgetItem",
          entityId: "item-1",
        }),
      );
    });
  });
});
