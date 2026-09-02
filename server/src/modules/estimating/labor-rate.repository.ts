import { db } from "../../infrastructure/database/client.js";

export class LaborRateRepository {
  async create(data: {
    orgId: string;
    classification: string;
    description?: string;
    unit?: string;
    rate: number;
    currency?: string;
    effectiveDate?: Date;
  }) {
    return db.laborRate.create({ data: { ...data } });
  }

  async findByOrg(orgId: string) {
    return db.laborRate.findMany({
      where: { orgId, isActive: true },
      orderBy: { classification: "asc" },
    });
  }

  async findById(id: string) {
    return db.laborRate.findUnique({ where: { id } });
  }

  async findByOrgAndClassification(orgId: string, classification: string) {
    return db.laborRate.findUnique({
      where: { orgId_classification: { orgId, classification } },
    });
  }

  async update(
    id: string,
    data: Partial<{
      classification: string;
      description: string;
      unit: string;
      rate: number;
      currency: string;
    }>,
  ) {
    return db.laborRate.update({ where: { id }, data });
  }

  async deactivate(id: string) {
    return db.laborRate.update({ where: { id }, data: { isActive: false } });
  }
}

export const laborRateRepository = new LaborRateRepository();
