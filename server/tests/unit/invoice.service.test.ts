import { describe, it, expect, vi, beforeEach } from "vitest";
import { InvoiceStatus, InvoiceType, PaymentMethod, Prisma } from "@prisma/client";
import { InvoiceService } from "../../src/modules/commercial/invoice.service.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../../src/common/AppError.js";

vi.mock("../../src/infrastructure/database/client.js", () => ({
  db: {
    $transaction: vi.fn(async (cb) => {
      const mockTx = {
        invoice: {
          update: vi.fn().mockImplementation(({ data }) => Promise.resolve({
            id: "inv-1",
            amountPaid: data.amountPaid,
            status: data.status,
          })),
        },
      };
      return (await cb(mockTx)) as unknown;
    }),
  },
}));

describe("InvoiceService", () => {
  let service: InvoiceService;
  let mockInvoiceRepo: any;
  let mockPaymentRepo: any;
  let mockCostRepo: any;
  let mockProjectRepo: any;
  let mockAudit: any;

  beforeEach(() => {
    mockInvoiceRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByNumber: vi.fn(),
      list: vi.fn(),
      updateStatus: vi.fn(),
    };

    mockPaymentRepo = {
      create: vi.fn(),
      listByOrg: vi.fn(),
    };

    mockCostRepo = {
      create: vi.fn(),
    };

    mockProjectRepo = {
      findById: vi.fn(),
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    service = new InvoiceService(
      mockInvoiceRepo,
      mockPaymentRepo,
      mockCostRepo,
      mockProjectRepo,
      mockAudit,
    );
  });

  describe("createInvoice", () => {
    it("should throw NotFoundError if project does not exist", async () => {
      mockProjectRepo.findById.mockResolvedValue(null);

      await expect(
        service.createInvoice("org-1", "user-1", {
          projectId: "proj-1",
          invoiceNumber: "INV-001",
          type: InvoiceType.ACCOUNTS_PAYABLE,
          issueDate: new Date(),
          dueDate: new Date(),
          subtotal: 1000,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw ConflictError if invoice number already exists in org", async () => {
      mockProjectRepo.findById.mockResolvedValue({ id: "proj-1" });
      mockInvoiceRepo.findByNumber.mockResolvedValue({ id: "inv-existing" });

      await expect(
        service.createInvoice("org-1", "user-1", {
          projectId: "proj-1",
          invoiceNumber: "INV-001",
          type: InvoiceType.ACCOUNTS_PAYABLE,
          issueDate: new Date(),
          dueDate: new Date(),
          subtotal: 1000,
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("should create invoice and log audit", async () => {
      mockProjectRepo.findById.mockResolvedValue({ id: "proj-1" });
      mockInvoiceRepo.findByNumber.mockResolvedValue(null);
      const created = {
        id: "inv-1",
        invoiceNumber: "INV-001",
        totalAmount: new Prisma.Decimal(1000),
        type: InvoiceType.ACCOUNTS_PAYABLE,
      };
      mockInvoiceRepo.create.mockResolvedValue(created);

      const res = await service.createInvoice("org-1", "user-1", {
        projectId: "proj-1",
        invoiceNumber: "INV-001",
        type: InvoiceType.ACCOUNTS_PAYABLE,
        issueDate: new Date(),
        dueDate: new Date(),
        subtotal: 1000,
      });

      expect(res.id).toBe("inv-1");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "INVOICE_CREATED",
          entity: "Invoice",
        }),
      );
    });
  });

  describe("approveInvoice", () => {
    it("should throw ForbiddenError if creator tries to self-approve", async () => {
      mockInvoiceRepo.findById.mockResolvedValue({
        id: "inv-1",
        status: InvoiceStatus.DRAFT,
        createdById: "user-creator-1",
      });

      await expect(
        service.approveInvoice("org-1", "user-creator-1", { id: "inv-1" }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("should approve invoice when approver is different", async () => {
      mockInvoiceRepo.findById.mockResolvedValue({
        id: "inv-1",
        status: InvoiceStatus.DRAFT,
        createdById: "user-creator-1",
      });
      mockInvoiceRepo.updateStatus.mockResolvedValue({
        id: "inv-1",
        status: InvoiceStatus.APPROVED,
      });

      const res = await service.approveInvoice("org-1", "user-finance-2", { id: "inv-1" });
      expect(res.status).toBe(InvoiceStatus.APPROVED);
    });
  });

  describe("recordPayment", () => {
    it("should reject if creator attempts to record disbursement (segregation)", async () => {
      mockInvoiceRepo.findById.mockResolvedValue({
        id: "inv-1",
        status: InvoiceStatus.APPROVED,
        createdById: "user-creator-1",
        totalAmount: new Prisma.Decimal(1000),
        amountPaid: new Prisma.Decimal(0),
      });

      await expect(
        service.recordPayment("org-1", "user-creator-1", {
          invoiceId: "inv-1",
          amount: 500,
          paymentDate: new Date(),
          paymentMethod: PaymentMethod.CHECK,
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("should record partial payment and update status to PARTIALLY_PAID", async () => {
      mockInvoiceRepo.findById.mockResolvedValue({
        id: "inv-1",
        projectId: "proj-1",
        invoiceNumber: "INV-001",
        status: InvoiceStatus.APPROVED,
        createdById: "user-creator-1",
        totalAmount: new Prisma.Decimal(1000),
        amountPaid: new Prisma.Decimal(0),
      });
      mockPaymentRepo.create.mockResolvedValue({
        id: "pay-1",
        paymentNumber: "PAY-0001",
        amount: new Prisma.Decimal(500),
      });

      const res = await service.recordPayment("org-1", "user-finance-2", {
        invoiceId: "inv-1",
        amount: 500,
        paymentDate: new Date(),
        paymentMethod: PaymentMethod.ACH,
      });

      expect(res.payment.id).toBe("pay-1");
      expect(res.invoice.status).toBe(InvoiceStatus.PARTIALLY_PAID);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PAYMENT_RECORDED",
          entity: "Payment",
        }),
      );
    });
  });
});
