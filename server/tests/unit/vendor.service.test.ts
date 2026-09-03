import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Vendor } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../src/common/index.js";
import { VendorService } from "../../src/modules/procurement/vendor.service.js";
import type { VendorRepository } from "../../src/modules/procurement/vendor.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";

function makeVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: "vnd_1",
    orgId: "org_1",
    vendorCode: "VND-0001",
    name: "BuildMat Supplies Ltd",
    contactPerson: "Sarah Jenkins",
    email: "sarah@buildmat.com",
    phone: "555-4321",
    address: "742 Evergreen Terrace",
    city: "Springfield",
    country: "USA",
    taxId: "TAX-9988",
    paymentTerms: "Net 30",
    currency: "USD",
    status: "ACTIVE",
    rating: null,
    notes: null,
    createdById: "user_1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("VendorService", () => {
  let service: VendorService;
  let mockVendorRepo: {
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findByCode: ReturnType<typeof vi.fn>;
    findByOrg: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    countByOrg: ReturnType<typeof vi.fn>;
  };
  let mockAuditService: {
    log: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockVendorRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByCode: vi.fn(),
      findByOrg: vi.fn(),
      update: vi.fn(),
      countByOrg: vi.fn(),
    };

    mockAuditService = {
      log: vi.fn(),
    };

    service = new VendorService(
      mockVendorRepo as unknown as VendorRepository,
      mockAuditService as unknown as AuditService,
    );
  });

  describe("createVendor", () => {
    it("generates VND-0001, VND-0002 sequentially and logs audit", async () => {
      mockVendorRepo.countByOrg.mockResolvedValueOnce(0);
      const vendor1 = makeVendor({ id: "vnd_1", vendorCode: "VND-0001" });
      mockVendorRepo.create.mockResolvedValueOnce(vendor1);

      const res1 = await service.createVendor("org_1", "user_1", {
        name: "BuildMat Supplies Ltd",
      });

      expect(mockVendorRepo.create).toHaveBeenCalledWith(
        "org_1",
        "user_1",
        "VND-0001",
        { name: "BuildMat Supplies Ltd" },
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "VENDOR_CREATED",
          entity: "vendor",
          entityId: "vnd_1",
        }),
      );
      expect(res1.vendorCode).toBe("VND-0001");

      mockVendorRepo.countByOrg.mockResolvedValueOnce(1);
      const vendor2 = makeVendor({ id: "vnd_2", vendorCode: "VND-0002" });
      mockVendorRepo.create.mockResolvedValueOnce(vendor2);

      const res2 = await service.createVendor("org_1", "user_1", {
        name: "Second Vendor",
      });
      expect(mockVendorRepo.create).toHaveBeenCalledWith(
        "org_1",
        "user_1",
        "VND-0002",
        { name: "Second Vendor" },
      );
      expect(res2.vendorCode).toBe("VND-0002");
    });

    it("throws ValidationError for empty vendor name", async () => {
      await expect(
        service.createVendor("org_1", "user_1", { name: "" }),
      ).rejects.toThrow(ValidationError);

      await expect(
        service.createVendor("org_1", "user_1", { name: "   " }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("getVendor", () => {
    it("returns vendor when found in org", async () => {
      const vendor = makeVendor();
      mockVendorRepo.findById.mockResolvedValue(vendor);

      const res = await service.getVendor("org_1", "vnd_1");
      expect(res).toEqual(vendor);
    });

    it("throws NotFoundError across tenant boundary", async () => {
      const vendor = makeVendor({ orgId: "other_org" });
      mockVendorRepo.findById.mockResolvedValue(vendor);

      await expect(service.getVendor("org_1", "vnd_1")).rejects.toThrow(NotFoundError);
    });

    it("throws NotFoundError when vendor does not exist", async () => {
      mockVendorRepo.findById.mockResolvedValue(null);

      await expect(service.getVendor("org_1", "nonexistent")).rejects.toThrow(NotFoundError);
    });
  });

  describe("listVendors", () => {
    it("passes filters to repository", async () => {
      const vendors = [makeVendor()];
      mockVendorRepo.findByOrg.mockResolvedValue(vendors);

      const res = await service.listVendors("org_1", {
        status: "ACTIVE",
        search: "BuildMat",
      });

      expect(mockVendorRepo.findByOrg).toHaveBeenCalledWith("org_1", {
        status: "ACTIVE",
        search: "BuildMat",
      });
      expect(res).toEqual(vendors);
    });
  });

  describe("updateVendor", () => {
    it("updates vendor and logs audit", async () => {
      const existing = makeVendor();
      const updated = makeVendor({ name: "BuildMat Pro" });
      mockVendorRepo.findById.mockResolvedValue(existing);
      mockVendorRepo.update.mockResolvedValue(updated);

      const res = await service.updateVendor("org_1", "vnd_1", "user_1", {
        name: "BuildMat Pro",
      });

      expect(mockVendorRepo.update).toHaveBeenCalledWith("org_1", "vnd_1", {
        name: "BuildMat Pro",
      });
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "VENDOR_UPDATED",
          entityId: "vnd_1",
        }),
      );
      expect(res.name).toBe("BuildMat Pro");
    });
  });

  describe("deactivateVendor", () => {
    it("sets status to INACTIVE and logs audit", async () => {
      const existing = makeVendor({ status: "ACTIVE" });
      const deactivated = makeVendor({ status: "INACTIVE" });
      mockVendorRepo.findById.mockResolvedValue(existing);
      mockVendorRepo.update.mockResolvedValue(deactivated);

      const res = await service.deactivateVendor("org_1", "vnd_1", "user_1");

      expect(mockVendorRepo.update).toHaveBeenCalledWith("org_1", "vnd_1", {
        status: "INACTIVE",
      });
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "VENDOR_STATUS_CHANGED",
          entityId: "vnd_1",
          newValue: { status: "INACTIVE" },
        }),
      );
      expect(res.status).toBe("INACTIVE");
    });
  });
});
