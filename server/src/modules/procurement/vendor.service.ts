import type { Vendor } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../common/AppError.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import { vendorRepository as defaultVendorRepository, type VendorRepository } from "./vendor.repository.js";
import {
  VENDOR_AUDIT_ACTIONS,
  type CreateVendorInput,
  type UpdateVendorInput,
  type VendorFilters,
} from "./vendor.types.js";

export class VendorService {
  constructor(
    private readonly repo: VendorRepository = defaultVendorRepository,
    private readonly audit: AuditService = defaultAuditService,
  ) {}

  async createVendor(
    orgId: string,
    userId: string,
    input: CreateVendorInput,
  ): Promise<Vendor> {
    if (!input.name?.trim()) {
      throw new ValidationError("Vendor name is required");
    }

    const count = await this.repo.countByOrg(orgId);
    const vendorCode = `VND-${String(count + 1).padStart(4, "0")}`;

    const vendor = await this.repo.create(orgId, userId, vendorCode, input);

    await this.audit.log({
      orgId,
      userId,
      action: VENDOR_AUDIT_ACTIONS.VENDOR_CREATED,
      entity: "vendor",
      entityId: vendor.id,
      newValue: {
        vendorCode,
        name: vendor.name,
      },
    });

    return vendor;
  }

  async getVendor(orgId: string, id: string): Promise<Vendor> {
    const vendor = await this.repo.findById(orgId, id);
    if (!vendor || vendor.orgId !== orgId) {
      throw new NotFoundError("Vendor not found");
    }
    return vendor;
  }

  async listVendors(orgId: string, filters: VendorFilters = {}): Promise<Vendor[]> {
    return this.repo.findByOrg(orgId, filters);
  }

  async updateVendor(
    orgId: string,
    id: string,
    userId: string,
    input: UpdateVendorInput,
  ): Promise<Vendor> {
    const existing = await this.getVendor(orgId, id);

    const updated = await this.repo.update(orgId, id, input);

    await this.audit.log({
      orgId,
      userId,
      action: VENDOR_AUDIT_ACTIONS.VENDOR_UPDATED,
      entity: "vendor",
      entityId: id,
      oldValue: {
        name: existing.name,
        status: existing.status,
      },
      newValue: {
        name: updated.name,
        status: updated.status,
      },
    });

    return updated;
  }

  async deactivateVendor(orgId: string, id: string, userId: string): Promise<Vendor> {
    const existing = await this.getVendor(orgId, id);

    const updated = await this.repo.update(orgId, id, {
      status: "INACTIVE",
    });

    await this.audit.log({
      orgId,
      userId,
      action: VENDOR_AUDIT_ACTIONS.VENDOR_STATUS_CHANGED,
      entity: "vendor",
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: "INACTIVE" },
    });

    return updated;
  }
}

export const vendorService = new VendorService();
