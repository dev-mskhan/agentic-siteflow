import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Material } from "@prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "../../src/common/index.js";
import { MaterialService } from "../../src/modules/procurement/material.service.js";
import type { MaterialRepository } from "../../src/modules/procurement/material.repository.js";
import type { VendorRepository } from "../../src/modules/procurement/vendor.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";

function makeMaterial(overrides: Partial<Material> = {}): Material {
  return {
    id: "mat_1",
    orgId: "org_1",
    itemCode: "MAT-0001",
    name: "Portland Cement Type I",
    description: "Standard 50kg bag",
    category: "Masonry",
    unit: "bag",
    standardCost: new Prisma.Decimal(12.5),
    currency: "USD",
    preferredVendorId: null,
    costCodeId: null,
    minStockLevel: new Prisma.Decimal(50),
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("MaterialService", () => {
  let service: MaterialService;
  let mockMaterialRepo: {
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findByCode: ReturnType<typeof vi.fn>;
    findByOrg: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    countByOrg: ReturnType<typeof vi.fn>;
  };
  let mockVendorRepo: {
    findById: ReturnType<typeof vi.fn>;
  };
  let mockAuditService: {
    log: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockMaterialRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByCode: vi.fn(),
      findByOrg: vi.fn(),
      update: vi.fn(),
      countByOrg: vi.fn(),
    };

    mockVendorRepo = {
      findById: vi.fn(),
    };

    mockAuditService = {
      log: vi.fn(),
    };

    service = new MaterialService(
      mockMaterialRepo as unknown as MaterialRepository,
      mockVendorRepo as unknown as VendorRepository,
      mockAuditService as unknown as AuditService,
    );
  });

  describe("createMaterial", () => {
    it("generates MAT-0001 sequentially when no code provided", async () => {
      mockMaterialRepo.countByOrg.mockResolvedValue(0);
      const created = makeMaterial();
      mockMaterialRepo.create.mockResolvedValue(created);

      const res = await service.createMaterial("org_1", "user_1", {
        name: "Portland Cement Type I",
        category: "Masonry",
        unit: "bag",
        standardCost: 12.5,
      });

      expect(mockMaterialRepo.create).toHaveBeenCalledWith(
        "org_1",
        "MAT-0001",
        expect.objectContaining({
          name: "Portland Cement Type I",
          category: "Masonry",
          unit: "bag",
        }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "MATERIAL_CREATED",
          entity: "material",
          entityId: "mat_1",
        }),
      );
      expect(res).toEqual(created);
    });

    it("accepts custom itemCode and rejects duplicate in same org", async () => {
      mockMaterialRepo.findByCode.mockResolvedValue(makeMaterial());

      await expect(
        service.createMaterial("org_1", "user_1", {
          name: "Duplicate Item",
          itemCode: "MAT-0001",
          category: "Masonry",
          unit: "bag",
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("rejects negative standardCost", async () => {
      await expect(
        service.createMaterial("org_1", "user_1", {
          name: "Cement",
          category: "Masonry",
          unit: "bag",
          standardCost: -5,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("validates preferredVendor exists in org", async () => {
      mockVendorRepo.findById.mockResolvedValue(null);

      await expect(
        service.createMaterial("org_1", "user_1", {
          name: "Cement",
          category: "Masonry",
          unit: "bag",
          preferredVendorId: "vnd_999",
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getMaterial", () => {
    it("returns material when found in org", async () => {
      const mat = makeMaterial();
      mockMaterialRepo.findById.mockResolvedValue(mat);

      const res = await service.getMaterial("org_1", "mat_1");
      expect(res).toEqual(mat);
    });

    it("enforces tenant isolation across org boundary", async () => {
      const mat = makeMaterial({ orgId: "other_org" });
      mockMaterialRepo.findById.mockResolvedValue(mat);

      await expect(service.getMaterial("org_1", "mat_1")).rejects.toThrow(NotFoundError);
    });
  });

  describe("listMaterials", () => {
    it("filters by category correctly", async () => {
      const materials = [makeMaterial()];
      mockMaterialRepo.findByOrg.mockResolvedValue(materials);

      const res = await service.listMaterials("org_1", { category: "Masonry" });

      expect(mockMaterialRepo.findByOrg).toHaveBeenCalledWith("org_1", {
        category: "Masonry",
      });
      expect(res).toEqual(materials);
    });
  });

  describe("updateMaterial", () => {
    it("updates fields and logs audit", async () => {
      const existing = makeMaterial();
      const updated = makeMaterial({ standardCost: new Prisma.Decimal(14) });
      mockMaterialRepo.findById.mockResolvedValue(existing);
      mockMaterialRepo.update.mockResolvedValue(updated);

      const res = await service.updateMaterial("org_1", "mat_1", "user_1", {
        standardCost: 14,
      });

      expect(mockMaterialRepo.update).toHaveBeenCalledWith("org_1", "mat_1", {
        standardCost: 14,
      });
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "MATERIAL_UPDATED",
          entityId: "mat_1",
        }),
      );
      expect(res.standardCost).toEqual(new Prisma.Decimal(14));
    });
  });

  describe("archiveMaterial", () => {
    it("sets isActive=false and logs audit", async () => {
      const existing = makeMaterial({ isActive: true });
      const archived = makeMaterial({ isActive: false });
      mockMaterialRepo.findById.mockResolvedValue(existing);
      mockMaterialRepo.update.mockResolvedValue(archived);

      const res = await service.archiveMaterial("org_1", "mat_1", "user_1");

      expect(mockMaterialRepo.update).toHaveBeenCalledWith("org_1", "mat_1", {
        isActive: false,
      });
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "MATERIAL_ARCHIVED",
          entityId: "mat_1",
          newValue: { isActive: false },
        }),
      );
      expect(res.isActive).toBe(false);
    });
  });
});
