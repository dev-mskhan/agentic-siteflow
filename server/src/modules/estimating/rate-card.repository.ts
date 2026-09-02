import { db } from "../../infrastructure/database/client.js";

export class RateCardRepository {
  async create(data: {
    orgId: string;
    name: string;
    description?: string;
    currency?: string;
    effectiveDate?: Date;
  }) {
    return db.rateCard.create({ data: { ...data } });
  }

  async findByOrg(orgId: string) {
    return db.rateCard.findMany({
      where: { orgId, isActive: true },
      include: { rateItems: true },
      orderBy: { effectiveDate: "desc" },
    });
  }

  async findById(id: string) {
    return db.rateCard.findUnique({ where: { id }, include: { rateItems: true } });
  }

  async deactivate(id: string) {
    return db.rateCard.update({ where: { id }, data: { isActive: false } });
  }

  async addItem(data: {
    rateCardId: string;
    orgId: string;
    type: string;
    code?: string;
    description: string;
    unit: string;
    rate: number;
    notes?: string;
  }) {
    return db.rateCardItem.create({ data: { ...data } });
  }

  async updateItem(
    id: string,
    data: Partial<{
      type: string;
      code: string;
      description: string;
      unit: string;
      rate: number;
      notes: string;
    }>,
  ) {
    return db.rateCardItem.update({ where: { id }, data });
  }

  async findItemById(id: string) {
    return db.rateCardItem.findUnique({ where: { id } });
  }
}

export const rateCardRepository = new RateCardRepository();
