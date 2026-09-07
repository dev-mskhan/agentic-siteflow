import { describe, it, expect, vi, beforeEach } from "vitest";
import { CostTransactionStatus, CostTransactionType, Prisma } from "@prisma/client";
import { CostTransactionService } from "../../src/modules/commercial/cost-transaction.service.js";
import { NotFoundError, ValidationError } from "../../src/common/AppError.js";

describe("CostTransactionService", () => {
  let service: CostTransactionService;
  let mockCostRepo: any;
  let mockProjectRepo: any;
  let mockAudit: any;

  beforeEach(() => {
    mockCostRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      list: vi.fn(),
      voidTransaction: vi.fn(),
    };

    mockProjectRepo = {
      findById: vi.fn(),
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    service = new CostTransactionService(mockCostRepo, mockProjectRepo, mockAudit);
  });

  describe("recordTransaction", () => {
    it("should throw NotFoundError if project does not exist", async () => {
      mockProjectRepo.findById.mockResolvedValue(null);

      await expect(
        service.recordTransaction("org-1", "user-1", {
          projectId: "proj-1",
          costCodeId: "code-1",
          transactionType: CostTransactionType.MATERIAL,
          amount: 500,
          transactionDate: new Date(),
          description: "Cement bags",
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw ValidationError if amount <= 0", async () => {
      mockProjectRepo.findById.mockResolvedValue({ id: "proj-1", orgId: "org-1" });

      await expect(
        service.recordTransaction("org-1", "user-1", {
          projectId: "proj-1",
          costCodeId: "code-1",
          transactionType: CostTransactionType.MATERIAL,
          amount: 0,
          transactionDate: new Date(),
          description: "Cement bags",
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("should successfully record cost transaction and audit log", async () => {
      mockProjectRepo.findById.mockResolvedValue({ id: "proj-1", orgId: "org-1" });
      const record = {
        id: "tx-1",
        orgId: "org-1",
        projectId: "proj-1",
        costCodeId: "code-1",
        transactionType: CostTransactionType.LABOR,
        amount: new Prisma.Decimal(1200),
        status: CostTransactionStatus.POSTED,
      };
      mockCostRepo.create.mockResolvedValue(record);

      const res = await service.recordTransaction("org-1", "user-1", {
        projectId: "proj-1",
        costCodeId: "code-1",
        transactionType: CostTransactionType.LABOR,
        amount: 1200,
        transactionDate: new Date(),
        description: "Drywall installation crew",
      });

      expect(res.id).toBe("tx-1");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "COST_TRANSACTION_RECORDED",
          entity: "CostTransaction",
          entityId: "tx-1",
        }),
      );
    });
  });

  describe("voidTransaction", () => {
    it("should throw ValidationError if already void", async () => {
      mockCostRepo.findById.mockResolvedValue({
        id: "tx-1",
        status: CostTransactionStatus.VOID,
      });

      await expect(
        service.voidTransaction("org-1", "user-1", {
          id: "tx-1",
          voidReason: "Duplicate entry",
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("should mark void and audit log", async () => {
      mockCostRepo.findById.mockResolvedValue({
        id: "tx-1",
        status: CostTransactionStatus.POSTED,
      });
      mockCostRepo.voidTransaction.mockResolvedValue({
        id: "tx-1",
        status: CostTransactionStatus.VOID,
        voidReason: "Duplicate entry",
      });

      const res = await service.voidTransaction("org-1", "user-1", {
        id: "tx-1",
        voidReason: "Duplicate entry",
      });

      expect(res.status).toBe(CostTransactionStatus.VOID);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "COST_TRANSACTION_VOIDED",
          entity: "CostTransaction",
          entityId: "tx-1",
        }),
      );
    });
  });

  describe("getActualCostSummary", () => {
    it("should aggregate costs by type and cost code accurately", async () => {
      mockProjectRepo.findById.mockResolvedValue({ id: "proj-1" });
      mockCostRepo.list.mockResolvedValue([
        {
          id: "tx-1",
          transactionType: CostTransactionType.MATERIAL,
          amount: new Prisma.Decimal(1000),
          costCodeId: "c-1",
          costCode: { code: "03-300", name: "Concrete" },
        },
        {
          id: "tx-2",
          transactionType: CostTransactionType.LABOR,
          amount: new Prisma.Decimal(500),
          costCodeId: "c-1",
          costCode: { code: "03-300", name: "Concrete" },
        },
        {
          id: "tx-3",
          transactionType: CostTransactionType.MATERIAL,
          amount: new Prisma.Decimal(300),
          costCodeId: "c-2",
          costCode: { code: "05-100", name: "Steel" },
        },
      ]);

      const summary = await service.getActualCostSummary("org-1", "proj-1");

      expect(summary.totalActualCost).toBe(1800);
      expect(summary.byType.MATERIAL).toBe(1300);
      expect(summary.byType.LABOR).toBe(500);
      expect(summary.byCostCode.length).toBe(2);
    });
  });
});
