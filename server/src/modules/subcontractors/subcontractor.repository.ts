import type { Subcontractor } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type {
  CreateSubcontractorInput,
  SubcontractorFilters,
  UpdateSubcontractorInput,
} from "./subcontractor.types.js";

export class SubcontractorRepository {
  async create(
    orgId: string,
    createdById: string,
    input: CreateSubcontractorInput,
    isCompliant: boolean,
  ): Promise<Subcontractor> {
    return db.subcontractor.create({
      data: {
        orgId,
        createdById,
        companyName: input.companyName,
        trade: input.trade,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        address: input.address,
        taxId: input.taxId,
        licenseNumber: input.licenseNumber,
        licenseExpiry: input.licenseExpiry,
        insurancePolicyNumber: input.insurancePolicyNumber,
        insuranceExpiry: input.insuranceExpiry,
        isCompliant,
        notes: input.notes,
      },
    });
  }

  async findById(orgId: string, id: string): Promise<Subcontractor | null> {
    return db.subcontractor.findFirst({
      where: { id, orgId },
      include: {
        contracts: true,
        assignedTasks: {
          select: {
            id: true,
            name: true,
            status: true,
            projectId: true,
            plannedStartDate: true,
            plannedEndDate: true,
          },
        },
      },
    });
  }

  async findByOrg(
    orgId: string,
    filters: SubcontractorFilters = {},
  ): Promise<Subcontractor[]> {
    const { trade, status, isCompliant, search, limit = 50, offset = 0 } = filters;

    return db.subcontractor.findMany({
      where: {
        orgId,
        ...(trade ? { trade } : {}),
        ...(status ? { status } : {}),
        ...(typeof isCompliant === "boolean" ? { isCompliant } : {}),
        ...(search
          ? {
              OR: [
                { companyName: { contains: search, mode: "insensitive" } },
                { contactName: { contains: search, mode: "insensitive" } },
                { trade: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  async update(
    orgId: string,
    id: string,
    data: UpdateSubcontractorInput,
  ): Promise<Subcontractor> {
    return db.subcontractor.update({
      where: { id, orgId },
      data,
    });
  }

  async delete(orgId: string, id: string): Promise<Subcontractor> {
    return db.subcontractor.delete({
      where: { id, orgId },
    });
  }

  async countByOrg(orgId: string): Promise<number> {
    return db.subcontractor.count({
      where: { orgId },
    });
  }
}

export const subcontractorRepository = new SubcontractorRepository();
