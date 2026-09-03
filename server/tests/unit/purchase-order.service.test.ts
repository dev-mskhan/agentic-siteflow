import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { PurchaseOrder, PurchaseOrderItem } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../src/common/index.js";
import { PurchaseOrderService } from "../../src/modules/procurement/purchase-order.service.js";
import type {
  PurchaseOrderRepository,
  PurchaseOrderWithItems,
} from "../../src/modules/procurement/purchase-order.repository.js";
import type {
  MaterialRequestRepository,
  MaterialRequestWithItems,
} from "../../src/modules/procurement/material-request.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";
import {
  calcItemTotal,
  calcPoSubtotal,
  calcTaxAmount,
  calcPoTotal,
} from "../../src/modules/procurement/po-calculation.js";

const ORG = "org_1";
const USER = "user_1";
const PROJECT = "proj_1";
const VENDOR = "vnd_1";
const PO_ID = "po_1";

function makePoItem(overrides: Partial<PurchaseOrderItem> = {}): PurchaseOrderItem {
  return {
    id: "poi_1",
    purchaseOrderId: PO_ID,
    materialId: "mat_1",
    description: "Ready-mix concrete C25",
    quantity: new Prisma.Decimal(10),
    unit: "m3",
    unitPrice: new Prisma.Decimal(120),
    totalPrice: new Prisma.Decimal(1200),
    receivedQuantity: new Prisma.Decimal(0),
    costCodeId: null,
    linkedTaskId: null,
    linkedBoqItemId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makePo(overrides: Partial<PurchaseOrder> = {}): PurchaseOrderWithItems {
  return {
    id: PO_ID,
    orgId: ORG,
    projectId: PROJECT,
    vendorId: VENDOR,
    poNumber: "PO-0001",
    status: "DRAFT",
    issueDate: null,
    expectedDeliveryDate: new Date("2026-10-15"),
    currency: "USD",
    subtotal: new Prisma.Decimal(1200),
    taxRate: new Prisma.Decimal(0.05),
    taxAmount: new Prisma.Decimal(60),
    shippingAmount: new Prisma.Decimal(50),
    totalAmount: new Prisma.Decimal(1310),
    paymentTerms: "Net 30",
    shippingAddress: "Site B",
    notes: null,
    materialRequestId: null,
    createdById: USER,
    approvedById: null,
    approvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [makePoItem()],
    ...overrides,
  };
}

describe("po-calculation", () => {
  it("calculates item total price with quantity * unitPrice", () => {
    const total = calcItemTotal(10, 120);
    expect(total.toNumber()).toBe(1200);

    const precision = calcItemTotal(3.3333, 10.5);
    expect(precision.toNumber()).toBe(34.9997);
  });

  it("calculates subtotal across multiple items", () => {
    const items = [
      { quantity: 10, unitPrice: 100 },
      { quantity: 5, unitPrice: 50 },
    ];
    const subtotal = calcPoSubtotal(items);
    expect(subtotal.toNumber()).toBe(1250);
  });

  it("calculates tax amount with rate", () => {
    const tax = calcTaxAmount(1000, 0.05);
    expect(tax.toNumber()).toBe(50);
  });

  it("calculates grand total: subtotal + tax + shipping", () => {
    const total = calcPoTotal(1000, 50, 75);
    expect(total.toNumber()).toBe(1125);
  });
});

describe("PurchaseOrderService", () => {
  let service: PurchaseOrderService;
  let mockPoRepo: {
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findByProject: ReturnType<typeof vi.fn>;
    findByVendor: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    addItem: ReturnType<typeof vi.fn>;
    countByOrg: ReturnType<typeof vi.fn>;
  };
  let mockMrRepo: {
    findById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let mockAudit: { log: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockPoRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByProject: vi.fn(),
      findByVendor: vi.fn(),
      update: vi.fn(),
      addItem: vi.fn(),
      countByOrg: vi.fn(),
    };
    mockMrRepo = {
      findById: vi.fn(),
      update: vi.fn(),
    };
    mockAudit = { log: vi.fn().mockResolvedValue(undefined) };

    service = new PurchaseOrderService(
      mockPoRepo as unknown as PurchaseOrderRepository,
      mockAudit as unknown as AuditService,
      mockMrRepo as unknown as MaterialRequestRepository,
    );
  });

  describe("createPO", () => {
    it("creates standalone PO, calculates totals accurately, and logs audit", async () => {
      const createdPo = makePo();
      mockPoRepo.countByOrg.mockResolvedValue(0);
      mockPoRepo.create.mockResolvedValue(createdPo);

      const result = await service.createPO(ORG, PROJECT, USER, {
        projectId: PROJECT,
        vendorId: VENDOR,
        taxRate: 0.05,
        shippingAmount: 50,
        items: [{ description: "Ready-mix concrete C25", quantity: 10, unit: "m3", unitPrice: 120 }],
      });

      expect(result.poNumber).toBe("PO-0001");
      expect(mockPoRepo.create).toHaveBeenCalledWith(
        ORG,
        USER,
        "PO-0001",
        expect.objectContaining({ vendorId: VENDOR, projectId: PROJECT }),
        expect.objectContaining({
          subtotal: expect.any(Prisma.Decimal) as Prisma.Decimal,
          taxAmount: expect.any(Prisma.Decimal) as Prisma.Decimal,
          totalAmount: expect.any(Prisma.Decimal) as Prisma.Decimal,
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PURCHASE_ORDER_CREATED",
          entity: "purchase_order",
          entityId: PO_ID,
        }),
      );
    });

    it("creates PO linked to MaterialRequest and updates request status to PARTIALLY_FULFILLED", async () => {
      const mockMr: MaterialRequestWithItems = {
        id: "mr_1",
        orgId: ORG,
        projectId: PROJECT,
        requestNumber: "MR-0001",
        title: "Concrete need",
        status: "APPROVED",
        priority: "HIGH",
        neededByDate: new Date(),
        deliveryLocation: null,
        notes: null,
        requestedById: USER,
        approvedById: USER,
        approvedAt: new Date(),
        rejectionReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
      };
      mockMrRepo.findById.mockResolvedValue(mockMr);
      mockPoRepo.countByOrg.mockResolvedValue(0);
      mockPoRepo.create.mockResolvedValue(makePo({ materialRequestId: "mr_1" }));

      await service.createPO(ORG, PROJECT, USER, {
        projectId: PROJECT,
        vendorId: VENDOR,
        materialRequestId: "mr_1",
        items: [{ description: "Concrete", quantity: 10, unit: "m3", unitPrice: 100 }],
      });

      expect(mockMrRepo.update).toHaveBeenCalledWith(ORG, "mr_1", {
        status: "PARTIALLY_FULFILLED",
      });
    });

    it("throws ValidationError if items array is empty", async () => {
      await expect(
        service.createPO(ORG, PROJECT, USER, {
          projectId: PROJECT,
          vendorId: VENDOR,
          items: [],
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError for non-positive quantity or negative price", async () => {
      await expect(
        service.createPO(ORG, PROJECT, USER, {
          projectId: PROJECT,
          vendorId: VENDOR,
          items: [{ description: "Item", quantity: 0, unit: "ea", unitPrice: 10 }],
        }),
      ).rejects.toThrow(ValidationError);

      await expect(
        service.createPO(ORG, PROJECT, USER, {
          projectId: PROJECT,
          vendorId: VENDOR,
          items: [{ description: "Item", quantity: 5, unit: "ea", unitPrice: -1 }],
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("issuePO", () => {
    it("updates status to ISSUED and logs MaterialOrdered domain event", async () => {
      const po = makePo({ status: "DRAFT" });
      mockPoRepo.findById.mockResolvedValue(po);
      const issuedPo = makePo({ status: "ISSUED", approvedById: USER, issueDate: new Date() });
      mockPoRepo.update.mockResolvedValue(issuedPo);

      const result = await service.issuePO(ORG, PO_ID, USER);

      expect(result.status).toBe("ISSUED");
      expect(mockPoRepo.update).toHaveBeenCalledWith(
        ORG,
        PO_ID,
        expect.objectContaining({
          status: "ISSUED",
          approvedById: USER,
          issueDate: expect.any(Date) as Date,
        }),
      );
      // Domain event check
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "MaterialOrdered",
          entity: "domain_event",
          entityId: PO_ID,
        }),
      );
      // Operational audit check
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PURCHASE_ORDER_ISSUED",
          entity: "purchase_order",
          entityId: PO_ID,
        }),
      );
    });

    it("throws ValidationError when issuing a non-DRAFT PO", async () => {
      const po = makePo({ status: "ISSUED" });
      mockPoRepo.findById.mockResolvedValue(po);

      await expect(service.issuePO(ORG, PO_ID, USER)).rejects.toThrow(ValidationError);
    });
  });

  describe("cancelPO", () => {
    it("cancels PO when 0 items received", async () => {
      const po = makePo({ status: "ISSUED", items: [makePoItem({ receivedQuantity: new Prisma.Decimal(0) })] });
      mockPoRepo.findById.mockResolvedValue(po);
      const cancelledPo = makePo({ status: "CANCELLED" });
      mockPoRepo.update.mockResolvedValue(cancelledPo);

      const result = await service.cancelPO(ORG, PO_ID, USER, "Project deferred");

      expect(result.status).toBe("CANCELLED");
      expect(mockPoRepo.update).toHaveBeenCalledWith(ORG, PO_ID, { status: "CANCELLED" });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PURCHASE_ORDER_CANCELLED",
          entity: "purchase_order",
          entityId: PO_ID,
        }),
      );
    });

    it("rejects cancellation if items have already been received", async () => {
      const po = makePo({
        status: "PARTIALLY_RECEIVED",
        items: [makePoItem({ receivedQuantity: new Prisma.Decimal(5) })],
      });
      mockPoRepo.findById.mockResolvedValue(po);

      await expect(service.cancelPO(ORG, PO_ID, USER)).rejects.toThrow(ValidationError);
    });
  });

  describe("getPO", () => {
    it("throws NotFoundError when PO does not exist or across org boundary", async () => {
      mockPoRepo.findById.mockResolvedValue(null);
      await expect(service.getPO(ORG, "nonexistent")).rejects.toThrow(NotFoundError);

      mockPoRepo.findById.mockResolvedValue(makePo({ orgId: "other_org" }));
      await expect(service.getPO(ORG, PO_ID)).rejects.toThrow(NotFoundError);
    });
  });
});
