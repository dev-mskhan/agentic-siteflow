import type { SubcontractorContract, SubcontractorContractStatus } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type {
  CreateSubcontractorContractInput,
  UpdateSubcontractorContractInput,
} from "./subcontractor.types.js";

export class SubcontractorContractRepository {
  async create(
    orgId: string,
    createdById: string,
    contractNumber: string,
    input: CreateSubcontractorContractInput,
  ): Promise<SubcontractorContract> {
    return db.subcontractorContract.create({
      data: {
        orgId,
        projectId: input.projectId,
        subcontractorId: input.subcontractorId,
        contractNumber,
        scopeOfWork: input.scopeOfWork,
        contractValue: input.contractValue,
        retainagePercent: input.retainagePercent ?? 0,
        startDate: input.startDate,
        endDate: input.endDate,
        costCodeId: input.costCodeId,
        createdById,
      },
    });
  }

  async findById(orgId: string, id: string): Promise<SubcontractorContract | null> {
    return db.subcontractorContract.findFirst({
      where: { id, orgId },
      include: {
        subcontractor: true,
        project: {
          select: { id: true, name: true, projectNumber: true },
        },
        costCode: true,
      },
    });
  }

  async findByProject(
    orgId: string,
    projectId: string,
  ): Promise<SubcontractorContract[]> {
    return db.subcontractorContract.findMany({
      where: { orgId, projectId },
      include: {
        subcontractor: true,
        costCode: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findBySubcontractor(
    orgId: string,
    subcontractorId: string,
  ): Promise<SubcontractorContract[]> {
    return db.subcontractorContract.findMany({
      where: { orgId, subcontractorId },
      include: {
        project: {
          select: { id: true, name: true, projectNumber: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async update(
    orgId: string,
    id: string,
    data: UpdateSubcontractorContractInput & { status?: SubcontractorContractStatus },
  ): Promise<SubcontractorContract> {
    return db.subcontractorContract.update({
      where: { id, orgId },
      data,
    });
  }

  async countByOrg(orgId: string): Promise<number> {
    return db.subcontractorContract.count({
      where: { orgId },
    });
  }
}

export const subcontractorContractRepository = new SubcontractorContractRepository();
