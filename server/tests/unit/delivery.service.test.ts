import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Delivery, DeliveryReceiptItem } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../src/common/index.js";
import { DeliveryService } from "../../src/modules/procurement/delivery.service.js";
import type {
  DeliveryRepository,
  DeliveryWithItems,
} from "../../src/modules/procurement/delivery.repository.js";
import type {
  PurchaseOrderRepository,
  PurchaseOrderWithItems,
} from "../../src/modules/procurement/purchase-order.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";

const ORG = "org_1";
const USER = "user_1";
const PROJECT = "proj_1";
const PO_ID = "po_1";
const DELIVERY_ID = "del_1";
const RECEIPT_ITEM_ID = "dri_1";
const PO_ITEM_ID = "poi_1";

function makeReceiptItem(
  overrides: Partial<DeliveryReceiptItem> = {},
): DeliveryReceiptItem & {
  poItem?: {
    id: string;
    description: string;
    quantity: unknown;
    receivedQuantity: unknown;
    unit: string;
  };
} {
  return {
    id: RECEIPT_ITEM_ID,
    deliveryId: DELIVERY_ID,
    poItemId: PO_ITEM_ID,
    quantityShipped: new Prisma.Decimal(10),
    quantityReceived: new Prisma.Decimal(0),
    quantityAccepted: new Prisma.Decimal(0),
    quantityRejected: new Prisma.Decimal(0),
    rejectionReason: null,
    notes: null,
    createdAt: new Date(),
    poItem: {
      id: PO_ITEM_ID,
      description: "Ready-mix concrete",
      quantity: new Prisma.Decimal(10),
      receivedQuantity: new Prisma.Decimal(0),
      unit: "m3",
    },
    ...overrides,
  };
}

function makeDelivery(overrides: Partial<Delivery> = {}): DeliveryWithItems {
  return {
    id: DELIVERY_ID,
    orgId: ORG,
    projectId: PROJECT,
    purchaseOrderId: PO_ID,
    deliveryNumber: "DEL-0001",
    deliveryNoteNumber: "DN-9988",
    carrier: "FastLogistics",
    trackingNumber: "TRK123",
    status: "SCHEDULED",
    expectedDate: new Date("2026-10-10"),
    actualDate: null,
    isDelayed: false,
    delayedDays: 0,
    delayReason: null,
    receivedById: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    receiptItems: [makeReceiptItem()],
    ...overrides,
  };
}

describe("DeliveryService", () => {
  let service: DeliveryService;
  let mockDeliveryRepo: {
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findByPO: ReturnType<typeof vi.fn>;
    findByProject: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    executeReceive: ReturnType<typeof vi.fn>;
    countByOrg: ReturnType<typeof vi.fn>;
  };
  let mockPoRepo: {
    findById: ReturnType<typeof vi.fn>;
  };
  let mockAudit: { log: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockDeliveryRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByPO: vi.fn(),
      findByProject: vi.fn(),
      update: vi.fn(),
      executeReceive: vi.fn(),
      countByOrg: vi.fn(),
    };
    mockPoRepo = {
      findById: vi.fn(),
    };
    mockAudit = { log: vi.fn().mockResolvedValue(undefined) };

    service = new DeliveryService(
      mockDeliveryRepo as unknown as DeliveryRepository,
      mockAudit as unknown as AuditService,
      mockPoRepo as unknown as PurchaseOrderRepository,
    );
  });

  describe("scheduleDelivery", () => {
    it("verifies PO status is ISSUED and schedules delivery with DEL-0001", async () => {
      const po: Partial<PurchaseOrderWithItems> = {
        id: PO_ID,
        orgId: ORG,
        projectId: PROJECT,
        status: "ISSUED",
      };
      mockPoRepo.findById.mockResolvedValue(po);
      mockDeliveryRepo.countByOrg.mockResolvedValue(0);

      const created = makeDelivery();
      mockDeliveryRepo.create.mockResolvedValue(created);

      const result = await service.scheduleDelivery(ORG, PO_ID, USER, {
        expectedDate: new Date("2026-10-10"),
        carrier: "FastLogistics",
        items: [{ poItemId: PO_ITEM_ID, quantityShipped: 10 }],
      });

      expect(result.deliveryNumber).toBe("DEL-0001");
      expect(mockDeliveryRepo.create).toHaveBeenCalledWith(
        ORG,
        PROJECT,
        PO_ID,
        "DEL-0001",
        expect.objectContaining({ carrier: "FastLogistics" }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "DELIVERY_SCHEDULED",
          entity: "delivery",
          entityId: DELIVERY_ID,
        }),
      );
    });

    it("throws ValidationError if PO is still in DRAFT status", async () => {
      mockPoRepo.findById.mockResolvedValue({
        id: PO_ID,
        orgId: ORG,
        status: "DRAFT",
      });

      await expect(
        service.scheduleDelivery(ORG, PO_ID, USER, {
          expectedDate: new Date("2026-10-10"),
          items: [{ poItemId: PO_ITEM_ID, quantityShipped: 10 }],
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError for empty items or non-positive quantity", async () => {
      mockPoRepo.findById.mockResolvedValue({
        id: PO_ID,
        orgId: ORG,
        status: "ISSUED",
      });

      await expect(
        service.scheduleDelivery(ORG, PO_ID, USER, {
          expectedDate: new Date("2026-10-10"),
          items: [],
        }),
      ).rejects.toThrow(ValidationError);

      await expect(
        service.scheduleDelivery(ORG, PO_ID, USER, {
          expectedDate: new Date("2026-10-10"),
          items: [{ poItemId: PO_ITEM_ID, quantityShipped: 0 }],
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("recordDelay", () => {
    it("calculates delay days, sets DELAYED status, and logs MaterialDelayed domain event", async () => {
      const delivery = makeDelivery({ expectedDate: new Date("2026-10-10") });
      mockDeliveryRepo.findById.mockResolvedValue(delivery);

      const delayedDate = new Date("2026-10-15"); // 5 days later
      const updated = makeDelivery({
        status: "DELAYED",
        isDelayed: true,
        delayedDays: 5,
        delayReason: "Supply chain bottleneck",
        expectedDate: delayedDate,
      });
      mockDeliveryRepo.update.mockResolvedValue(updated);

      const result = await service.recordDelay(ORG, DELIVERY_ID, USER, {
        newExpectedDate: delayedDate,
        delayReason: "Supply chain bottleneck",
      });

      expect(result.status).toBe("DELAYED");
      expect(mockDeliveryRepo.update).toHaveBeenCalledWith(
        ORG,
        DELIVERY_ID,
        expect.objectContaining({
          delayedDays: 5,
          isDelayed: true,
          delayReason: "Supply chain bottleneck",
          status: "DELAYED",
        }),
      );
      // Check domain event
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "MaterialDelayed",
          entity: "domain_event",
          entityId: DELIVERY_ID,
        }),
      );
    });

    it("throws ValidationError if delay reason is empty", async () => {
      mockDeliveryRepo.findById.mockResolvedValue(makeDelivery());

      await expect(
        service.recordDelay(ORG, DELIVERY_ID, USER, {
          newExpectedDate: new Date("2026-10-15"),
          delayReason: "   ",
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("receiveDelivery", () => {
    it("updates quantities, transitions status, and logs MaterialDelivered domain event", async () => {
      const delivery = makeDelivery();
      mockDeliveryRepo.findById.mockResolvedValue(delivery);

      const receivedDelivery = makeDelivery({
        status: "DELIVERED",
        actualDate: new Date("2026-10-10"),
        receiptItems: [
          makeReceiptItem({
            quantityReceived: new Prisma.Decimal(10),
            quantityAccepted: new Prisma.Decimal(10),
            quantityRejected: new Prisma.Decimal(0),
          }),
        ],
      });
      mockDeliveryRepo.executeReceive.mockResolvedValue(receivedDelivery);

      const result = await service.receiveDelivery(ORG, DELIVERY_ID, USER, {
        deliveryNoteNumber: "DN-1001",
        receipts: [
          {
            receiptItemId: RECEIPT_ITEM_ID,
            quantityReceived: 10,
            quantityAccepted: 10,
            quantityRejected: 0,
          },
        ],
      });

      expect(result.status).toBe("DELIVERED");
      expect(mockDeliveryRepo.executeReceive).toHaveBeenCalledWith(
        ORG,
        DELIVERY_ID,
        PO_ID,
        USER,
        expect.any(Date) as Date,
        "DN-1001",
        "DELIVERED",
        expect.arrayContaining([
          expect.objectContaining({
            id: RECEIPT_ITEM_ID,
            quantityAccepted: 10,
            quantityRejected: 0,
          }),
        ]),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "MaterialDelivered",
          entity: "domain_event",
          entityId: DELIVERY_ID,
        }),
      );
    });

    it("rejects invalid accepted + rejected sum > quantityReceived", async () => {
      const delivery = makeDelivery();
      mockDeliveryRepo.findById.mockResolvedValue(delivery);

      await expect(
        service.receiveDelivery(ORG, DELIVERY_ID, USER, {
          receipts: [
            {
              receiptItemId: RECEIPT_ITEM_ID,
              quantityReceived: 10,
              quantityAccepted: 8,
              quantityRejected: 5, // 8 + 5 = 13 > 10
            },
          ],
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError if delivery is already DELIVERED", async () => {
      const delivery = makeDelivery({ status: "DELIVERED" });
      mockDeliveryRepo.findById.mockResolvedValue(delivery);

      await expect(
        service.receiveDelivery(ORG, DELIVERY_ID, USER, {
          receipts: [
            {
              receiptItemId: RECEIPT_ITEM_ID,
              quantityReceived: 10,
              quantityAccepted: 10,
              quantityRejected: 0,
            },
          ],
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("getDelivery", () => {
    it("enforces tenant isolation across org boundaries", async () => {
      mockDeliveryRepo.findById.mockResolvedValue(makeDelivery({ orgId: "other_org" }));

      await expect(service.getDelivery(ORG, DELIVERY_ID)).rejects.toThrow(NotFoundError);
    });
  });
});
