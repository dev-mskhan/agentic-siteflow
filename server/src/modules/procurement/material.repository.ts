import type { Material } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type { CreateMaterialInput, MaterialFilters, UpdateMaterialInput } from "./material.types.js";

export class MaterialRepository {
  async create(
    orgId: string,
    itemCode: string,
    input: CreateMaterialInput,
  ): Promise<Material> {
    return db.material.create({
      data: {
        orgId,
        itemCode,
        name: input.name,
        description: input.description,
        category: input.category,
        unit: input.unit,
        standardCost: input.standardCost ?? 0,
        currency: input.currency ?? "USD",
        preferredVendorId: input.preferredVendorId,
        costCodeId: input.costCodeId,
        minStockLevel: input.minStockLevel,
      },
    });
  }

  async findById(orgId: string, id: string): Promise<Material | null> {
    return db.material.findFirst({
      where: { id, orgId },
      include: {
        preferredVendor: {
          select: { id: true, name: true, vendorCode: true },
        },
        costCode: {
          select: { id: true, code: true, name: true },
        },
      },
    });
  }

  async findByCode(orgId: string, itemCode: string): Promise<Material | null> {
    return db.material.findFirst({
      where: { itemCode, orgId },
    });
  }

  async findByOrg(orgId: string, filters: MaterialFilters = {}): Promise<Material[]> {
    const { category, isActive, search, preferredVendorId, limit = 50, offset = 0 } = filters;

    return db.material.findMany({
      where: {
        orgId,
        ...(category ? { category } : {}),
        ...(typeof isActive === "boolean" ? { isActive } : {}),
        ...(preferredVendorId ? { preferredVendorId } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { itemCode: { contains: search, mode: "insensitive" } },
                { category: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        preferredVendor: {
          select: { id: true, name: true, vendorCode: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  async update(orgId: string, id: string, data: UpdateMaterialInput): Promise<Material> {
    return db.material.update({
      where: { id, orgId },
      data,
    });
  }

  async countByOrg(orgId: string): Promise<number> {
    return db.material.count({
      where: { orgId },
    });
  }
}

export const materialRepository = new MaterialRepository();
