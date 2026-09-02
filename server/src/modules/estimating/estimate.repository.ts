import { db } from "../../infrastructure/database/client.js";
import type { EstimateStatus } from "@prisma/client";
import type { CreateEstimateInput, UpdateEstimateInput, EstimateFilters } from "./estimate.types.js";

export class EstimateRepository {
  async create(
    data: CreateEstimateInput & {
      orgId: string;
      estimateNumber: string;
      createdById: string;
    },
  ) {
    return db.estimate.create({ data: { ...data } });
  }

  async findById(orgId: string, id: string) {
    return db.estimate.findFirst({ where: { id, orgId } });
  }

  async findByOrg(orgId: string, filters: EstimateFilters = {}) {
    const { status, limit = 50, offset = 0 } = filters;
    return db.estimate.findMany({
      where: { orgId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  async countByOrg(orgId: string) {
    return db.estimate.count({ where: { orgId } });
  }

  async update(
    orgId: string,
    id: string,
    data: UpdateEstimateInput & {
      status?: EstimateStatus;
      version?: number;
      projectId?: string;
      subtotal?: number;
      overhead?: number;
      contingency?: number;
      markup?: number;
      totalCost?: number;
      sellingPrice?: number;
      margin?: number;
      overheadPercent?: number;
      contingencyPercent?: number;
      markupPercent?: number;
    },
  ) {
    return db.estimate.update({ where: { id, orgId }, data });
  }

  async delete(orgId: string, id: string) {
    return db.estimate.delete({ where: { id, orgId } });
  }
}

export const estimateRepository = new EstimateRepository();
