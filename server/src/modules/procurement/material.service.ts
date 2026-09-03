import type { Material } from "@prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "../../common/AppError.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import {
  materialRepository as defaultMaterialRepository,
  type MaterialRepository,
} from "./material.repository.js";
import {
  vendorRepository as defaultVendorRepository,
  type VendorRepository,
} from "./vendor.repository.js";
import {
  MATERIAL_AUDIT_ACTIONS,
  type CreateMaterialInput,
  type MaterialFilters,
  type UpdateMaterialInput,
} from "./material.types.js";

export class MaterialService {
  constructor(
    private readonly materialRepo: MaterialRepository = defaultMaterialRepository,
    private readonly vendorRepo: VendorRepository = defaultVendorRepository,
    private readonly audit: AuditService = defaultAuditService,
  ) {}

  async createMaterial(
    orgId: string,
    userId: string,
    input: CreateMaterialInput,
  ): Promise<Material> {
    if (!input.name?.trim()) {
      throw new ValidationError("Material name is required");
    }
    if (!input.category?.trim()) {
      throw new ValidationError("Category is required");
    }
    if (!input.unit?.trim()) {
      throw new ValidationError("Unit of measurement is required");
    }
    if (input.standardCost !== undefined && input.standardCost < 0) {
      throw new ValidationError("Standard cost cannot be negative");
    }

    let itemCode = input.itemCode?.trim();
    if (itemCode) {
      const existing = await this.materialRepo.findByCode(orgId, itemCode);
      if (existing) {
        throw new ConflictError(`Material with code ${itemCode} already exists in organization`);
      }
    } else {
      const count = await this.materialRepo.countByOrg(orgId);
      itemCode = `MAT-${String(count + 1).padStart(4, "0")}`;
    }

    if (input.preferredVendorId) {
      const vendor = await this.vendorRepo.findById(orgId, input.preferredVendorId);
      if (!vendor || vendor.orgId !== orgId) {
        throw new NotFoundError("Preferred vendor not found in organization");
      }
    }

    const material = await this.materialRepo.create(orgId, itemCode, input);

    await this.audit.log({
      orgId,
      userId,
      action: MATERIAL_AUDIT_ACTIONS.MATERIAL_CREATED,
      entity: "material",
      entityId: material.id,
      newValue: {
        itemCode,
        name: material.name,
        category: material.category,
        unit: material.unit,
        standardCost: material.standardCost,
      },
    });

    return material;
  }

  async getMaterial(orgId: string, id: string): Promise<Material> {
    const material = await this.materialRepo.findById(orgId, id);
    if (!material || material.orgId !== orgId) {
      throw new NotFoundError("Material not found");
    }
    return material;
  }

  async listMaterials(orgId: string, filters: MaterialFilters = {}): Promise<Material[]> {
    return this.materialRepo.findByOrg(orgId, filters);
  }

  async updateMaterial(
    orgId: string,
    id: string,
    userId: string,
    input: UpdateMaterialInput,
  ): Promise<Material> {
    const existing = await this.getMaterial(orgId, id);

    if (input.standardCost !== undefined && input.standardCost < 0) {
      throw new ValidationError("Standard cost cannot be negative");
    }

    if (input.preferredVendorId) {
      const vendor = await this.vendorRepo.findById(orgId, input.preferredVendorId);
      if (!vendor || vendor.orgId !== orgId) {
        throw new NotFoundError("Preferred vendor not found in organization");
      }
    }

    const updated = await this.materialRepo.update(orgId, id, input);

    await this.audit.log({
      orgId,
      userId,
      action: MATERIAL_AUDIT_ACTIONS.MATERIAL_UPDATED,
      entity: "material",
      entityId: id,
      oldValue: {
        name: existing.name,
        standardCost: existing.standardCost,
        category: existing.category,
        preferredVendorId: existing.preferredVendorId,
      },
      newValue: {
        name: updated.name,
        standardCost: updated.standardCost,
        category: updated.category,
        preferredVendorId: updated.preferredVendorId,
      },
    });

    return updated;
  }

  async archiveMaterial(orgId: string, id: string, userId: string): Promise<Material> {
    const existing = await this.getMaterial(orgId, id);

    const updated = await this.materialRepo.update(orgId, id, {
      isActive: false,
    });

    await this.audit.log({
      orgId,
      userId,
      action: MATERIAL_AUDIT_ACTIONS.MATERIAL_ARCHIVED,
      entity: "material",
      entityId: id,
      oldValue: { isActive: existing.isActive },
      newValue: { isActive: false },
    });

    return updated;
  }
}

export const materialService = new MaterialService();
