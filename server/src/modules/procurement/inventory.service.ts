import { NotFoundError, ValidationError } from "../../common/index.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import { InventoryRepository } from "./inventory.repository.js";
import {
  INVENTORY_AUDIT_ACTIONS,
  type InventoryFilters,
  type MaterialStockSummary,
  type RecordInventoryTransactionInput,
} from "./inventory.types.js";
import type { InventoryTransaction } from "@prisma/client";

const defaultInventoryRepo = new InventoryRepository();

export class InventoryService {
  constructor(
    private readonly repo: InventoryRepository = defaultInventoryRepo,
    private readonly audit: AuditService = defaultAuditService,
  ) {}

  /**
   * 5.7.6 — Record an inventory transaction (receipt, consumption, transfer, return, adjustment)
   * with negative inventory prevention for consumptions/returns/transfers.
   */
  async recordTransaction(
    orgId: string,
    projectId: string,
    userId: string,
    input: RecordInventoryTransactionInput,
  ): Promise<InventoryTransaction> {
    // 1. Verify project exists and belongs to org
    const project = await this.repo.findProject(orgId, projectId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }

    // 2. Verify material exists and belongs to org
    const material = await this.repo.findMaterial(orgId, input.materialId);
    if (!material) {
      throw new NotFoundError("Material not found");
    }

    // 3. Verify cost code if provided
    if (input.costCodeId) {
      const costCode = await this.repo.findCostCode(orgId, input.costCodeId);
      if (!costCode) {
        throw new NotFoundError("Cost code not found");
      }
    }

    // 4. Validate quantity
    if (input.type === "ADJUSTMENT") {
      if (input.quantity === 0) {
        throw new ValidationError("Adjustment quantity cannot be zero");
      }
    } else {
      if (input.quantity <= 0) {
        throw new ValidationError("Quantity must be greater than zero");
      }
    }

    // 5. Check stock sufficiency for deductions
    const isDeduction =
      input.type === "CONSUMPTION" ||
      input.type === "RETURN_TO_VENDOR" ||
      input.type === "TRANSFER_OUT";

    if (isDeduction) {
      const currentStock = await this.repo.calculateStock(orgId, projectId, input.materialId);
      if (currentStock < input.quantity) {
        throw new ValidationError(
          `Insufficient on-site stock for ${input.type.toLowerCase().replace(/_/g, " ")}: available ${currentStock} ${material.unit}, requested ${input.quantity} ${material.unit}`,
        );
      }
    }

    // 6. Compute costs
    const unitCost = input.unitCost ?? (material.standardCost ? Number(material.standardCost) : null);
    const totalCost = unitCost != null ? Math.abs(input.quantity) * unitCost : null;
    const unit = input.unit ?? material.unit;

    // 7. Record transaction
    const transaction = await this.repo.create({
      orgId,
      projectId,
      materialId: input.materialId,
      type: input.type,
      quantity: input.quantity,
      unit,
      unitCost,
      totalCost,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      costCodeId: input.costCodeId,
      notes: input.notes,
      performedById: userId,
    });

    // 8. Audit log
    await this.audit.log({
      orgId,
      userId,
      action: INVENTORY_AUDIT_ACTIONS.INVENTORY_TRANSACTED,
      entity: "inventory_transaction",
      entityId: transaction.id,
      newValue: {
        projectId,
        materialId: input.materialId,
        type: input.type,
        quantity: input.quantity,
        unit,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
      },
    });

    return transaction;
  }

  /**
   * 5.7.6 — Get current stock levels on a project, optionally filtered by material.
   */
  async getProjectStock(
    orgId: string,
    projectId: string,
    materialId?: string,
  ): Promise<MaterialStockSummary[]> {
    const project = await this.repo.findProject(orgId, projectId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }

    return this.repo.getProjectStock(orgId, projectId, materialId);
  }

  /**
   * 5.7.6 — Record consumption linked to a task.
   */
  async recordConsumptionFromTask(
    orgId: string,
    projectId: string,
    taskId: string,
    materialId: string,
    quantity: number,
    userId: string,
    notes?: string,
  ): Promise<InventoryTransaction> {
    return this.recordTransaction(orgId, projectId, userId, {
      materialId,
      type: "CONSUMPTION",
      quantity,
      referenceType: "TASK",
      referenceId: taskId,
      notes,
    });
  }

  /**
   * 5.7.6 — Record consumption linked to a daily log.
   */
  async recordConsumptionFromDailyLog(
    orgId: string,
    projectId: string,
    dailyLogId: string,
    materialId: string,
    quantity: number,
    userId: string,
    notes?: string,
  ): Promise<InventoryTransaction> {
    return this.recordTransaction(orgId, projectId, userId, {
      materialId,
      type: "CONSUMPTION",
      quantity,
      referenceType: "DAILY_LOG",
      referenceId: dailyLogId,
      notes,
    });
  }

  /**
   * List inventory transactions for a project with optional filters.
   */
  async listTransactions(
    orgId: string,
    projectId: string,
    filters?: InventoryFilters,
  ): Promise<{ transactions: InventoryTransaction[]; total: number }> {
    const project = await this.repo.findProject(orgId, projectId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }

    return this.repo.listByProject(orgId, projectId, filters);
  }
}

export const inventoryService = new InventoryService();

