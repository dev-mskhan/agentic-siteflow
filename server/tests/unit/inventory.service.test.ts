import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { InventoryTransaction, Material } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../src/common/index.js";
import { InventoryService } from "../../src/modules/procurement/inventory.service.js";
import type { InventoryRepository } from "../../src/modules/procurement/inventory.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";
import type { MaterialStockSummary } from "../../src/modules/procurement/inventory.types.js";

const ORG = "org_1";
const USER = "user_1";
const PROJECT = "proj_1";
const MATERIAL_ID = "mat_1";
const COST_CODE_ID = "cc_1";

function makeMaterial(overrides: Partial<Material> = {}): Material {
  return {
    id: MATERIAL_ID,
    orgId: ORG,
    itemCode: "MAT-0001",
    name: "Portland Cement",
    description: "50kg bag",
    category: "Masonry",
    unit: "bag",
    standardCost: new Prisma.Decimal(12.5),
    currency: "USD",
    preferredVendorId: null,
    costCodeId: null,
    minStockLevel: new Prisma.Decimal(20),
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeTransaction(
  overrides: Partial<InventoryTransaction> = {},
): InventoryTransaction {
  return {
    id: "tx_1",
    orgId: ORG,
    projectId: PROJECT,
    materialId: MATERIAL_ID,
    type: "RECEIPT",
    quantity: new Prisma.Decimal(100),
    unit: "bag",
    unitCost: new Prisma.Decimal(12.5),
    totalCost: new Prisma.Decimal(1250),
    referenceType: "DELIVERY",
    referenceId: "del_1",
    costCodeId: null,
    notes: null,
    performedById: USER,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("InventoryService", () => {
  let service: InventoryService;
  let mockRepo: {
    findProject: ReturnType<typeof vi.fn>;
    findMaterial: ReturnType<typeof vi.fn>;
    findCostCode: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findByProjectAndMaterial: ReturnType<typeof vi.fn>;
    listByProject: ReturnType<typeof vi.fn>;
    calculateStock: ReturnType<typeof vi.fn>;
    getProjectStock: ReturnType<typeof vi.fn>;
  };
  let mockAudit: { log: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockRepo = {
      findProject: vi.fn(),
      findMaterial: vi.fn(),
      findCostCode: vi.fn(),
      create: vi.fn(),
      findByProjectAndMaterial: vi.fn(),
      listByProject: vi.fn(),
      calculateStock: vi.fn(),
      getProjectStock: vi.fn(),
    };
    mockAudit = { log: vi.fn().mockResolvedValue(undefined) };

    service = new InventoryService(
      mockRepo as unknown as InventoryRepository,
      mockAudit as unknown as AuditService,
    );
  });

  describe("recordTransaction", () => {
    it("successfully records RECEIPT, calculates totalCost, and logs audit", async () => {
      const material = makeMaterial();
      const createdTx = makeTransaction();

      mockRepo.findProject.mockResolvedValue({ id: PROJECT });
      mockRepo.findMaterial.mockResolvedValue(material);
      mockRepo.create.mockResolvedValue(createdTx);

      const result = await service.recordTransaction(ORG, PROJECT, USER, {
        materialId: MATERIAL_ID,
        type: "RECEIPT",
        quantity: 100,
        unitCost: 12.5,
        referenceType: "DELIVERY",
        referenceId: "del_1",
      });

      expect(result.id).toBe("tx_1");
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: ORG,
          projectId: PROJECT,
          materialId: MATERIAL_ID,
          type: "RECEIPT",
          quantity: 100,
          unit: "bag",
          unitCost: 12.5,
          totalCost: 1250,
          performedById: USER,
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "INVENTORY_TRANSACTED",
          entity: "inventory_transaction",
          entityId: "tx_1",
        }),
      );
    });

    it("throws NotFoundError if project does not exist", async () => {
      mockRepo.findProject.mockResolvedValue(null);

      await expect(
        service.recordTransaction(ORG, PROJECT, USER, {
          materialId: MATERIAL_ID,
          type: "RECEIPT",
          quantity: 10,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("throws NotFoundError if material does not exist", async () => {
      mockRepo.findProject.mockResolvedValue({ id: PROJECT });
      mockRepo.findMaterial.mockResolvedValue(null);

      await expect(
        service.recordTransaction(ORG, PROJECT, USER, {
          materialId: MATERIAL_ID,
          type: "RECEIPT",
          quantity: 10,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("throws NotFoundError if cost code does not exist", async () => {
      mockRepo.findProject.mockResolvedValue({ id: PROJECT });
      mockRepo.findMaterial.mockResolvedValue(makeMaterial());
      mockRepo.findCostCode.mockResolvedValue(null);

      await expect(
        service.recordTransaction(ORG, PROJECT, USER, {
          materialId: MATERIAL_ID,
          type: "RECEIPT",
          quantity: 10,
          costCodeId: COST_CODE_ID,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("throws ValidationError for non-positive quantity on non-adjustment types", async () => {
      mockRepo.findProject.mockResolvedValue({ id: PROJECT });
      mockRepo.findMaterial.mockResolvedValue(makeMaterial());

      await expect(
        service.recordTransaction(ORG, PROJECT, USER, {
          materialId: MATERIAL_ID,
          type: "RECEIPT",
          quantity: 0,
        }),
      ).rejects.toThrow(ValidationError);

      await expect(
        service.recordTransaction(ORG, PROJECT, USER, {
          materialId: MATERIAL_ID,
          type: "RECEIPT",
          quantity: -5,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError for zero quantity on ADJUSTMENT", async () => {
      mockRepo.findProject.mockResolvedValue({ id: PROJECT });
      mockRepo.findMaterial.mockResolvedValue(makeMaterial());

      await expect(
        service.recordTransaction(ORG, PROJECT, USER, {
          materialId: MATERIAL_ID,
          type: "ADJUSTMENT",
          quantity: 0,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("prevents negative stock: throws ValidationError when consuming more than available stock", async () => {
      mockRepo.findProject.mockResolvedValue({ id: PROJECT });
      mockRepo.findMaterial.mockResolvedValue(makeMaterial());
      mockRepo.calculateStock.mockResolvedValue(25); // Only 25 available

      await expect(
        service.recordTransaction(ORG, PROJECT, USER, {
          materialId: MATERIAL_ID,
          type: "CONSUMPTION",
          quantity: 30, // Attempting to consume 30
        }),
      ).rejects.toThrow(ValidationError);

      expect(mockRepo.calculateStock).toHaveBeenCalledWith(ORG, PROJECT, MATERIAL_ID);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it("prevents negative stock on RETURN_TO_VENDOR and TRANSFER_OUT", async () => {
      mockRepo.findProject.mockResolvedValue({ id: PROJECT });
      mockRepo.findMaterial.mockResolvedValue(makeMaterial());
      mockRepo.calculateStock.mockResolvedValue(10);

      await expect(
        service.recordTransaction(ORG, PROJECT, USER, {
          materialId: MATERIAL_ID,
          type: "RETURN_TO_VENDOR",
          quantity: 15,
        }),
      ).rejects.toThrow(ValidationError);

      await expect(
        service.recordTransaction(ORG, PROJECT, USER, {
          materialId: MATERIAL_ID,
          type: "TRANSFER_OUT",
          quantity: 15,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("allows CONSUMPTION when available stock is sufficient", async () => {
      const material = makeMaterial();
      const consumptionTx = makeTransaction({
        type: "CONSUMPTION",
        quantity: new Prisma.Decimal(20),
      });

      mockRepo.findProject.mockResolvedValue({ id: PROJECT });
      mockRepo.findMaterial.mockResolvedValue(material);
      mockRepo.calculateStock.mockResolvedValue(50); // 50 available, consuming 20
      mockRepo.create.mockResolvedValue(consumptionTx);

      const result = await service.recordTransaction(ORG, PROJECT, USER, {
        materialId: MATERIAL_ID,
        type: "CONSUMPTION",
        quantity: 20,
      });

      expect(result.type).toBe("CONSUMPTION");
      expect(mockRepo.create).toHaveBeenCalled();
    });
  });

  describe("getProjectStock", () => {
    it("returns stock list and correctly flags items below minStockLevel", async () => {
      mockRepo.findProject.mockResolvedValue({ id: PROJECT });

      const stockSummary: MaterialStockSummary[] = [
        {
          materialId: "mat_1",
          itemCode: "MAT-0001",
          name: "Portland Cement",
          category: "Masonry",
          unit: "bag",
          currentStock: 15,
          minStockLevel: 20,
          isBelowMinimum: true, // 15 < 20
        },
        {
          materialId: "mat_2",
          itemCode: "MAT-0002",
          name: "Reinforcing Steel",
          category: "Metals",
          unit: "ton",
          currentStock: 50,
          minStockLevel: 10,
          isBelowMinimum: false, // 50 >= 10
        },
      ];

      mockRepo.getProjectStock.mockResolvedValue(stockSummary);

      const result = await service.getProjectStock(ORG, PROJECT);
      expect(result).toHaveLength(2);
      expect(result[0]!.isBelowMinimum).toBe(true);
      expect(result[1]!.isBelowMinimum).toBe(false);
      expect(mockRepo.getProjectStock).toHaveBeenCalledWith(ORG, PROJECT, undefined);
    });

    it("throws NotFoundError if project does not exist", async () => {
      mockRepo.findProject.mockResolvedValue(null);

      await expect(service.getProjectStock(ORG, PROJECT)).rejects.toThrow(NotFoundError);
    });
  });

  describe("task and daily log consumption helpers", () => {
    it("recordConsumptionFromTask records consumption with TASK reference", async () => {
      const material = makeMaterial();
      const tx = makeTransaction({
        type: "CONSUMPTION",
        quantity: new Prisma.Decimal(5),
        referenceType: "TASK",
        referenceId: "task_123",
      });

      mockRepo.findProject.mockResolvedValue({ id: PROJECT });
      mockRepo.findMaterial.mockResolvedValue(material);
      mockRepo.calculateStock.mockResolvedValue(20);
      mockRepo.create.mockResolvedValue(tx);

      const result = await service.recordConsumptionFromTask(
        ORG,
        PROJECT,
        "task_123",
        MATERIAL_ID,
        5,
        USER,
        "Used for foundation slab",
      );

      expect(result.type).toBe("CONSUMPTION");
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceType: "TASK",
          referenceId: "task_123",
          notes: "Used for foundation slab",
        }),
      );
    });

    it("recordConsumptionFromDailyLog records consumption with DAILY_LOG reference", async () => {
      const material = makeMaterial();
      const tx = makeTransaction({
        type: "CONSUMPTION",
        quantity: new Prisma.Decimal(8),
        referenceType: "DAILY_LOG",
        referenceId: "log_456",
      });

      mockRepo.findProject.mockResolvedValue({ id: PROJECT });
      mockRepo.findMaterial.mockResolvedValue(material);
      mockRepo.calculateStock.mockResolvedValue(20);
      mockRepo.create.mockResolvedValue(tx);

      const result = await service.recordConsumptionFromDailyLog(
        ORG,
        PROJECT,
        "log_456",
        MATERIAL_ID,
        8,
        USER,
        "Site supervisor log entry",
      );

      expect(result.type).toBe("CONSUMPTION");
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceType: "DAILY_LOG",
          referenceId: "log_456",
          notes: "Site supervisor log entry",
        }),
      );
    });
  });

  describe("listTransactions", () => {
    it("returns paginated transactions from repo", async () => {
      mockRepo.findProject.mockResolvedValue({ id: PROJECT });
      mockRepo.listByProject.mockResolvedValue({
        transactions: [makeTransaction()],
        total: 1,
      });

      const result = await service.listTransactions(ORG, PROJECT, { limit: 10, offset: 0 });
      expect(result.total).toBe(1);
      expect(result.transactions).toHaveLength(1);
      expect(mockRepo.listByProject).toHaveBeenCalledWith(ORG, PROJECT, { limit: 10, offset: 0 });
    });
  });
});
