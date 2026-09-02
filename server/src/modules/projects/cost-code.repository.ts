import { db } from "../../infrastructure/database/client.js";

export interface CreateCostCodeInput {
  orgId: string;
  code: string;
  name: string;
  description?: string;
  category?: string;
  parentId?: string;
}

export interface UpdateCostCodeInput {
  name?: string;
  description?: string;
  category?: string;
  parentId?: string;
}

export class CostCodeRepository {
  async create(data: CreateCostCodeInput) {
    return db.costCode.create({ data });
  }

  async findByOrg(orgId: string) {
    return db.costCode.findMany({
      where: { orgId, isActive: true },
      orderBy: { code: "asc" },
    });
  }

  async findById(id: string) {
    return db.costCode.findUnique({ where: { id } });
  }

  async findByOrgAndCode(orgId: string, code: string) {
    return db.costCode.findUnique({ where: { orgId_code: { orgId, code } } });
  }

  async update(id: string, data: UpdateCostCodeInput) {
    return db.costCode.update({ where: { id }, data });
  }

  async deactivate(id: string) {
    return db.costCode.update({ where: { id }, data: { isActive: false } });
  }
}

export const costCodeRepository = new CostCodeRepository();
