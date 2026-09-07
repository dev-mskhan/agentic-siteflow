import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChangeOrderStatus, Prisma } from "@prisma/client";
import { ChangeOrderService } from "../../src/modules/commercial/change-order.service.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../../src/common/AppError.js";

// Mock db for transaction
vi.mock("../../src/infrastructure/database/client.js", () => ({
  db: {
    $transaction: vi.fn(async (cb) => {
      const mockTx = {
        changeOrder: {
          update: vi.fn().mockImplementation(({ data }) => Promise.resolve({
            id: "co-1",
            status: data.status,
            approvedById: data.approvedById,
            approvedAt: data.approvedAt,
          })),
        },
        subcontractorContract: {
          findUnique: vi.fn().mockResolvedValue({
            id: "contract-1",
            contractValue: new Prisma.Decimal(50000),
          }),
          update: vi.fn().mockResolvedValue({}),
        },
      };
      return (await cb(mockTx)) as unknown;
    }),
  },
}));

describe("ChangeOrderService", () => {
  let service: ChangeOrderService;
  let mockChangeOrderRepo: any;
  let mockBudgetRepo: any;
  let mockProjectRepo: any;
  let mockAudit: any;

  beforeEach(() => {
    mockChangeOrderRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      list: vi.fn(),
      updateStatus: vi.fn(),
    };

    mockBudgetRepo = {
      adjustApprovedChanges: vi.fn().mockResolvedValue({}),
    };

    mockProjectRepo = {
      findById: vi.fn(),
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    service = new ChangeOrderService(
      mockChangeOrderRepo,
      mockBudgetRepo,
      mockProjectRepo,
      mockAudit,
    );
  });

  describe("create", () => {
    it("should throw NotFoundError if project does not exist", async () => {
      mockProjectRepo.findById.mockResolvedValue(null);

      await expect(
        service.create("org-1", "user-1", {
          projectId: "proj-1",
          title: "Additional Rebar",
          description: "Required due to site soil conditions",
          items: [{ description: "Grade 60 Rebar", quantity: 10, unitPrice: 50 }],
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should create change order and record audit log", async () => {
      mockProjectRepo.findById.mockResolvedValue({ id: "proj-1" });
      const created = {
        id: "co-1",
        changeOrderNumber: "CO-001",
        costDelta: new Prisma.Decimal(500),
        scheduleDeltaDays: 2,
      };
      mockChangeOrderRepo.create.mockResolvedValue(created);

      const res = await service.create("org-1", "user-1", {
        projectId: "proj-1",
        title: "Additional Rebar",
        description: "Soil conditions",
        items: [{ description: "Rebar", quantity: 10, unitPrice: 50 }],
      });

      expect(res.id).toBe("co-1");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "CHANGE_ORDER_CREATED",
          entity: "ChangeOrder",
        }),
      );
    });
  });

  describe("submit", () => {
    it("should allow transition from DRAFT to SUBMITTED", async () => {
      mockChangeOrderRepo.findById.mockResolvedValue({
        id: "co-1",
        status: ChangeOrderStatus.DRAFT,
      });
      mockChangeOrderRepo.updateStatus.mockResolvedValue({
        id: "co-1",
        status: ChangeOrderStatus.SUBMITTED,
      });

      const res = await service.submit("org-1", "user-1", "co-1");
      expect(res.status).toBe(ChangeOrderStatus.SUBMITTED);
    });

    it("should reject submit if not in DRAFT status", async () => {
      mockChangeOrderRepo.findById.mockResolvedValue({
        id: "co-1",
        status: ChangeOrderStatus.APPROVED,
      });

      await expect(service.submit("org-1", "user-1", "co-1")).rejects.toThrow(ValidationError);
    });
  });

  describe("approve", () => {
    it("should enforce segregation of duties (creator cannot approve)", async () => {
      mockChangeOrderRepo.findById.mockResolvedValue({
        id: "co-1",
        status: ChangeOrderStatus.SUBMITTED,
        requestedById: "user-creator-1",
        costDelta: new Prisma.Decimal(1000),
        items: [],
      });

      await expect(
        service.approve("org-1", "user-creator-1", { id: "co-1" }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("should approve successfully and trigger budget adjustment", async () => {
      mockChangeOrderRepo.findById.mockResolvedValue({
        id: "co-1",
        projectId: "proj-1",
        status: ChangeOrderStatus.SUBMITTED,
        requestedById: "user-creator-1",
        costDelta: new Prisma.Decimal(1000),
        items: [{ costCodeId: "code-1", amount: new Prisma.Decimal(1000) }],
      });

      const res = await service.approve("org-1", "user-approver-2", {
        id: "co-1",
        clientApproved: true,
      });

      expect(res.status).toBe(ChangeOrderStatus.APPROVED);
      expect(mockBudgetRepo.adjustApprovedChanges).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "CHANGE_ORDER_APPROVED",
          entity: "ChangeOrder",
          entityId: "co-1",
        }),
      );
    });
  });

  describe("reject", () => {
    it("should update status to REJECTED with reason", async () => {
      mockChangeOrderRepo.findById.mockResolvedValue({
        id: "co-1",
        status: ChangeOrderStatus.SUBMITTED,
        requestedById: "user-creator-1",
      });
      mockChangeOrderRepo.updateStatus.mockResolvedValue({
        id: "co-1",
        status: ChangeOrderStatus.REJECTED,
      });

      const res = await service.reject("org-1", "user-approver-2", {
        id: "co-1",
        rejectionReason: "Out of scope",
      });

      expect(res.status).toBe(ChangeOrderStatus.REJECTED);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "CHANGE_ORDER_REJECTED",
          entity: "ChangeOrder",
        }),
      );
    });
  });
});
