import { db } from "../../infrastructure/database/client.js";

export interface CreateBoqItemInput {
  estimateId: string;
  orgId: string;
  itemCode?: string;
  description: string;
  category?: string;
  unit: string;
  quantity: number;
  materialRate?: number;
  laborRate?: number;
  equipmentRate?: number;
  subcontractorRate?: number;
  directCostRate?: number;
  directCostAmount?: number;
  markupPercent?: number;
  sellingRate?: number;
  amount?: number;
  phaseId?: string;
  costCodeId?: string;
  notes?: string;
  order?: number;
}

export class BoqItemRepository {
  async create(data: CreateBoqItemInput) {
    return db.boqItem.create({ data: { ...data } });
  }

  async createMany(items: CreateBoqItemInput[]) {
    return db.boqItem.createMany({ data: items });
  }

  async findByEstimate(estimateId: string) {
    return db.boqItem.findMany({
      where: { estimateId },
      orderBy: { order: "asc" },
    });
  }

  async findById(id: string) {
    return db.boqItem.findUnique({ where: { id } });
  }

  async update(id: string, data: Partial<CreateBoqItemInput>) {
    return db.boqItem.update({ where: { id }, data });
  }

  async delete(id: string) {
    return db.boqItem.delete({ where: { id } });
  }

  async deleteByEstimate(estimateId: string) {
    return db.boqItem.deleteMany({ where: { estimateId } });
  }

  async countByEstimate(estimateId: string) {
    return db.boqItem.count({ where: { estimateId } });
  }

  async reorder(estimateId: string, orderedIds: string[]) {
    await db.$transaction(
      orderedIds.map((id, index) =>
        db.boqItem.update({ where: { id, estimateId }, data: { order: index } }),
      ),
    );
  }
}

export const boqItemRepository = new BoqItemRepository();
