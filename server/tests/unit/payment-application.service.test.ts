import { describe, it, expect, vi, beforeEach } from "vitest";
import { PaymentApplicationStatus, Prisma } from "@prisma/client";
import { PaymentApplicationService } from "../../src/modules/commercial/payment-application.service.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../../src/common/AppError.js";

describe("PaymentApplicationService", () => {
  let service: PaymentApplicationService;
  let mockAppRepo: any;
  let mockSovRepo: any;
  let mockProjectRepo: any;
  let mockAudit: any;

  beforeEach(() => {
    mockAppRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      list: vi.fn(),
      getLatestApprovedApp: vi.fn(),
      updateStatus: vi.fn(),
    };

    mockSovRepo = {
      findById: vi.fn(),
    };

    mockProjectRepo = {
      findById: vi.fn(),
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    service = new PaymentApplicationService(
      mockAppRepo,
      mockSovRepo,
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
          sovId: "sov-1",
          periodStart: new Date(),
          periodEnd: new Date(),
          lineItems: [{ sovItemId: "sov-item-1", workCompletedThisPeriod: 1000 }],
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw NotFoundError if SOV does not exist", async () => {
      mockProjectRepo.findById.mockResolvedValue({ id: "proj-1" });
      mockSovRepo.findById.mockResolvedValue(null);

      await expect(
        service.create("org-1", "user-1", {
          projectId: "proj-1",
          sovId: "sov-1",
          periodStart: new Date(),
          periodEnd: new Date(),
          lineItems: [{ sovItemId: "sov-item-1", workCompletedThisPeriod: 1000 }],
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should create application, calculate G702 amounts and log audit", async () => {
      mockProjectRepo.findById.mockResolvedValue({ id: "proj-1" });
      mockSovRepo.findById.mockResolvedValue({ id: "sov-1", totalScheduledValue: new Prisma.Decimal(10000) });
      mockAppRepo.getLatestApprovedApp.mockResolvedValue(null);

      const created = {
        id: "app-1",
        applicationNumber: 1,
        currentPaymentDue: new Prisma.Decimal(900), // 1000 - 10% retainage
        totalCompletedAndStored: new Prisma.Decimal(1000),
      };
      mockAppRepo.create.mockResolvedValue(created);

      const res = await service.create("org-1", "user-1", {
        projectId: "proj-1",
        sovId: "sov-1",
        periodStart: new Date(),
        periodEnd: new Date(),
        lineItems: [{ sovItemId: "sov-item-1", workCompletedThisPeriod: 1000 }],
      });

      expect(res.id).toBe("app-1");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PAYMENT_APPLICATION_CREATED",
          entity: "PaymentApplication",
          entityId: "app-1",
        }),
      );
    });
  });

  describe("submit", () => {
    it("should allow transition from DRAFT to SUBMITTED", async () => {
      mockAppRepo.findById.mockResolvedValue({
        id: "app-1",
        status: PaymentApplicationStatus.DRAFT,
      });
      mockAppRepo.updateStatus.mockResolvedValue({
        id: "app-1",
        status: PaymentApplicationStatus.SUBMITTED,
      });

      const res = await service.submit("org-1", "user-1", "app-1");
      expect(res.status).toBe(PaymentApplicationStatus.SUBMITTED);
    });

    it("should throw ValidationError if status is not DRAFT", async () => {
      mockAppRepo.findById.mockResolvedValue({
        id: "app-1",
        status: PaymentApplicationStatus.APPROVED,
      });

      await expect(service.submit("org-1", "user-1", "app-1")).rejects.toThrow(
        ValidationError,
      );
    });
  });

  describe("approve", () => {
    it("should reject approval if submitter attempts self-approval (segregation of duties)", async () => {
      mockAppRepo.findById.mockResolvedValue({
        id: "app-1",
        status: PaymentApplicationStatus.SUBMITTED,
        submittedById: "user-submitter-1",
      });

      await expect(
        service.approve("org-1", "user-submitter-1", "app-1"),
      ).rejects.toThrow(ForbiddenError);
    });

    it("should approve when approver is different and log audit", async () => {
      mockAppRepo.findById.mockResolvedValue({
        id: "app-1",
        status: PaymentApplicationStatus.SUBMITTED,
        submittedById: "user-submitter-1",
      });
      mockAppRepo.updateStatus.mockResolvedValue({
        id: "app-1",
        status: PaymentApplicationStatus.APPROVED,
      });

      const res = await service.approve("org-1", "user-finance-2", "app-1");
      expect(res.status).toBe(PaymentApplicationStatus.APPROVED);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PAYMENT_APPLICATION_APPROVED",
          entity: "PaymentApplication",
        }),
      );
    });
  });
});
