import type { Vendor } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type { CreateVendorInput, UpdateVendorInput, VendorFilters } from "./vendor.types.js";

export class VendorRepository {
  async create(
    orgId: string,
    createdById: string,
    vendorCode: string,
    input: CreateVendorInput,
  ): Promise<Vendor> {
    return db.vendor.create({
      data: {
        orgId,
        createdById,
        vendorCode,
        name: input.name,
        contactPerson: input.contactPerson,
        email: input.email,
        phone: input.phone,
        address: input.address,
        city: input.city,
        country: input.country,
        taxId: input.taxId,
        paymentTerms: input.paymentTerms,
        currency: input.currency ?? "USD",
        notes: input.notes,
      },
    });
  }

  async findById(orgId: string, id: string): Promise<Vendor | null> {
    return db.vendor.findFirst({
      where: { id, orgId },
    });
  }

  async findByCode(orgId: string, vendorCode: string): Promise<Vendor | null> {
    return db.vendor.findFirst({
      where: { vendorCode, orgId },
    });
  }

  async findByOrg(orgId: string, filters: VendorFilters = {}): Promise<Vendor[]> {
    const { status, search, city, limit = 50, offset = 0 } = filters;

    return db.vendor.findMany({
      where: {
        orgId,
        ...(status ? { status } : {}),
        ...(city ? { city: { contains: city, mode: "insensitive" } } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { contactPerson: { contains: search, mode: "insensitive" } },
                { vendorCode: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  async update(orgId: string, id: string, data: UpdateVendorInput): Promise<Vendor> {
    return db.vendor.update({
      where: { id, orgId },
      data,
    });
  }

  async countByOrg(orgId: string): Promise<number> {
    return db.vendor.count({
      where: { orgId },
    });
  }
}

export const vendorRepository = new VendorRepository();
