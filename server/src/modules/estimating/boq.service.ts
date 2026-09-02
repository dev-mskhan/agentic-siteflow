import { NotFoundError, ValidationError } from "../../common/index.js";
import type { BoqItemRepository } from "./boq-item.repository.js";
import type { EstimateService } from "./estimate.service.js";
import type { AuditService } from "../audit/audit.service.js";
import { EDITABLE_STATUSES, ESTIMATE_AUDIT_ACTIONS } from "./estimate.types.js";
import {
  calcDirectCostRate,
  calcDirectCostAmount,
  calcSellingRate,
  calcItemAmount,
} from "./calculation.js";

export interface AddBoqItemInput {
  itemCode?: string;
  description: string;
  category?: string;
  unit: string;
  quantity: number;
  materialRate?: number;
  laborRate?: number;
  equipmentRate?: number;
  subcontractorRate?: number;
  markupPercent?: number;
  phaseId?: string;
  costCodeId?: string;
  notes?: string;
}

export interface UpdateBoqItemInput {
  itemCode?: string;
  description?: string;
  category?: string;
  unit?: string;
  quantity?: number;
  materialRate?: number;
  laborRate?: number;
  equipmentRate?: number;
  subcontractorRate?: number;
  markupPercent?: number;
  phaseId?: string;
  costCodeId?: string;
  notes?: string;
}

export class BoqService {
  constructor(
    private readonly boqRepo: BoqItemRepository,
    private readonly estimateService: EstimateService,
    private readonly auditService: AuditService,
  ) {}

  async addItem(
    orgId: string,
    estimateId: string,
    userId: string,
    input: AddBoqItemInput,
  ) {
    const estimate = await this.estimateService.getEstimate(orgId, estimateId);
    if (!EDITABLE_STATUSES.includes(estimate.status)) {
      throw new ValidationError(
        `Cannot add items to an estimate with status ${estimate.status}`,
      );
    }

    if (!input.unit || input.unit.trim().length === 0) {
      throw new ValidationError("Unit is required");
    }
    if (input.unit.length > 20) {
      throw new ValidationError("Unit must be 20 characters or less");
    }
    if (!input.quantity || input.quantity <= 0) {
      throw new ValidationError("Quantity must be greater than 0");
    }

    const materialRate = input.materialRate ?? 0;
    const laborRate = input.laborRate ?? 0;
    const equipmentRate = input.equipmentRate ?? 0;
    const subcontractorRate = input.subcontractorRate ?? 0;
    const markupPct = input.markupPercent ?? 0;

    const directCostRate = calcDirectCostRate(
      materialRate,
      laborRate,
      equipmentRate,
      subcontractorRate,
    );
    const directCostAmount = calcDirectCostAmount(directCostRate, input.quantity);
    const sellingRate = calcSellingRate(directCostRate, markupPct);
    const amount = calcItemAmount(sellingRate, input.quantity);

    const count = await this.boqRepo.countByEstimate(estimateId);

    const item = await this.boqRepo.create({
      estimateId,
      orgId,
      itemCode: input.itemCode,
      description: input.description,
      category: input.category,
      unit: input.unit,
      quantity: input.quantity,
      materialRate,
      laborRate,
      equipmentRate,
      subcontractorRate,
      directCostRate,
      directCostAmount,
      markupPercent: markupPct,
      sellingRate,
      amount,
      phaseId: input.phaseId,
      costCodeId: input.costCodeId,
      notes: input.notes,
      order: count,
    });

    await this.estimateService.recalculateTotals(orgId, estimateId);

    await this.auditService.log({
      orgId,
      userId,
      action: ESTIMATE_AUDIT_ACTIONS.BOQ_ITEM_ADDED,
      entity: "estimate",
      entityId: estimateId,
      newValue: { itemId: item.id, description: item.description },
    });

    return item;
  }

  async updateItem(
    orgId: string,
    estimateId: string,
    itemId: string,
    userId: string,
    input: UpdateBoqItemInput,
  ) {
    const estimate = await this.estimateService.getEstimate(orgId, estimateId);
    if (!EDITABLE_STATUSES.includes(estimate.status)) {
      throw new ValidationError(
        `Cannot update items in an estimate with status ${estimate.status}`,
      );
    }

    const existingItem = await this.boqRepo.findById(itemId);
    if (!existingItem || existingItem.estimateId !== estimateId) {
      throw new NotFoundError("BOQ item not found in this estimate");
    }

    if (input.unit !== undefined) {
      if (input.unit.trim().length === 0) throw new ValidationError("Unit is required");
      if (input.unit.length > 20) throw new ValidationError("Unit must be 20 characters or less");
    }
    if (input.quantity !== undefined && input.quantity <= 0) {
      throw new ValidationError("Quantity must be greater than 0");
    }

    // Recompute calculated fields using merged values
    const materialRate = input.materialRate ?? Number(existingItem.materialRate);
    const laborRate = input.laborRate ?? Number(existingItem.laborRate);
    const equipmentRate = input.equipmentRate ?? Number(existingItem.equipmentRate);
    const subcontractorRate = input.subcontractorRate ?? Number(existingItem.subcontractorRate);
    const quantity = input.quantity ?? Number(existingItem.quantity);
    const markupPct = input.markupPercent ?? Number(existingItem.markupPercent);

    const directCostRate = calcDirectCostRate(
      materialRate,
      laborRate,
      equipmentRate,
      subcontractorRate,
    );
    const directCostAmount = calcDirectCostAmount(directCostRate, quantity);
    const sellingRate = calcSellingRate(directCostRate, markupPct);
    const amount = calcItemAmount(sellingRate, quantity);

    const updated = await this.boqRepo.update(itemId, {
      ...input,
      directCostRate,
      directCostAmount,
      sellingRate,
      amount,
    });

    await this.estimateService.recalculateTotals(orgId, estimateId);

    await this.auditService.log({
      orgId,
      userId,
      action: ESTIMATE_AUDIT_ACTIONS.BOQ_ITEM_UPDATED,
      entity: "estimate",
      entityId: estimateId,
      newValue: { itemId, ...input },
    });

    return updated;
  }

  async deleteItem(
    orgId: string,
    estimateId: string,
    itemId: string,
    userId: string,
  ) {
    const estimate = await this.estimateService.getEstimate(orgId, estimateId);
    if (!EDITABLE_STATUSES.includes(estimate.status)) {
      throw new ValidationError(
        `Cannot delete items from an estimate with status ${estimate.status}`,
      );
    }

    const existingItem = await this.boqRepo.findById(itemId);
    if (!existingItem || existingItem.estimateId !== estimateId) {
      throw new NotFoundError("BOQ item not found in this estimate");
    }

    await this.boqRepo.delete(itemId);
    await this.estimateService.recalculateTotals(orgId, estimateId);

    await this.auditService.log({
      orgId,
      userId,
      action: ESTIMATE_AUDIT_ACTIONS.BOQ_ITEM_DELETED,
      entity: "estimate",
      entityId: estimateId,
      oldValue: { itemId, description: existingItem.description },
    });
  }

  async listItems(orgId: string, estimateId: string) {
    await this.estimateService.getEstimate(orgId, estimateId);
    return this.boqRepo.findByEstimate(estimateId);
  }

  async reorderItems(
    orgId: string,
    estimateId: string,
    orderedIds: string[],
    userId: string,
  ) {
    await this.estimateService.getEstimate(orgId, estimateId);

    // Verify all IDs belong to this estimate
    const items = await this.boqRepo.findByEstimate(estimateId);
    const itemIds = new Set(items.map((i) => i.id));

    for (const id of orderedIds) {
      if (!itemIds.has(id)) {
        throw new ValidationError(`BOQ item ${id} does not belong to this estimate`);
      }
    }

    await this.boqRepo.reorder(estimateId, orderedIds);

    await this.auditService.log({
      orgId,
      userId,
      action: ESTIMATE_AUDIT_ACTIONS.BOQ_ITEMS_REORDERED,
      entity: "estimate",
      entityId: estimateId,
      newValue: { orderedIds },
    });
  }
}
