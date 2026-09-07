import { CostTransactionStatus, type CostTransaction, type CostTransactionType } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../common/AppError.js";
import { cacheDel, cacheKey } from "../../infrastructure/redis/cache.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import { projectRepository as defaultProjectRepository, type ProjectRepository } from "../projects/project.repository.js";
import {
  costTransactionRepository as defaultCostTransactionRepo,
  type CostTransactionRepository,
} from "./cost-transaction.repository.js";
import {
  COST_TRANSACTION_AUDIT_ACTIONS,
  type ActualCostSummary,
  type CostTransactionDetail,
  type CostTransactionFilters,
  type RecordCostTransactionInput,
  type VoidCostTransactionInput,
} from "./cost-transaction.types.js";

export class CostTransactionService {
  constructor(
    private readonly costRepo: CostTransactionRepository = defaultCostTransactionRepo,
    private readonly projectRepo: ProjectRepository = defaultProjectRepository,
    private readonly audit: AuditService = defaultAuditService,
  ) {}

  async recordTransaction(
    orgId: string,
    userId: string,
    input: RecordCostTransactionInput,
  ): Promise<CostTransaction> {
    const project = await this.projectRepo.findById(orgId, input.projectId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }

    if (input.amount <= 0) {
      throw new ValidationError("Cost transaction amount must be greater than 0");
    }

    if (!input.description?.trim()) {
      throw new ValidationError("Cost transaction description is required");
    }

    const transaction = await this.costRepo.create(orgId, userId, input);

    await this.audit.log({
      orgId,
      userId,
      action: COST_TRANSACTION_AUDIT_ACTIONS.COST_TRANSACTION_RECORDED,
      entity: "CostTransaction",
      entityId: transaction.id,
      newValue: {
        projectId: transaction.projectId,
        costCodeId: transaction.costCodeId,
        amount: Number(transaction.amount),
        type: transaction.transactionType,
      },
    });

    await cacheDel(
      cacheKey.financialOverview(input.projectId),
      cacheKey.orgFinancialOverview(orgId),
    );

    return transaction;
  }

  async getTransaction(orgId: string, id: string): Promise<CostTransactionDetail> {
    const tx = await this.costRepo.findById(orgId, id);
    if (!tx) {
      throw new NotFoundError("Cost transaction not found");
    }
    return tx;
  }

  async listTransactions(
    orgId: string,
    filters: CostTransactionFilters = {},
  ): Promise<CostTransactionDetail[]> {
    return this.costRepo.list(orgId, filters);
  }

  async voidTransaction(
    orgId: string,
    userId: string,
    input: VoidCostTransactionInput,
  ): Promise<CostTransaction> {
    const existing = await this.costRepo.findById(orgId, input.id);
    if (!existing) {
      throw new NotFoundError("Cost transaction not found");
    }

    if (existing.status === CostTransactionStatus.VOID) {
      throw new ValidationError("Cost transaction is already void");
    }

    if (!input.voidReason?.trim()) {
      throw new ValidationError("Void reason is required");
    }

    const voided = await this.costRepo.voidTransaction(
      orgId,
      input.id,
      userId,
      input.voidReason,
    );

    await this.audit.log({
      orgId,
      userId,
      action: COST_TRANSACTION_AUDIT_ACTIONS.COST_TRANSACTION_VOIDED,
      entity: "CostTransaction",
      entityId: input.id,
      oldValue: { status: existing.status },
      newValue: { status: voided.status, voidReason: input.voidReason },
    });

    await cacheDel(
      cacheKey.financialOverview(existing.projectId),
      cacheKey.orgFinancialOverview(orgId),
    );

    return voided;
  }

  async getActualCostSummary(
    orgId: string,
    projectId: string,
  ): Promise<ActualCostSummary> {
    const project = await this.projectRepo.findById(orgId, projectId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }

    const transactions = await this.costRepo.list(orgId, {
      projectId,
      status: CostTransactionStatus.POSTED,
      limit: 10000,
    });

    let totalActualCost = 0;
    const byType: Record<CostTransactionType, number> = {
      LABOR: 0,
      MATERIAL: 0,
      EQUIPMENT: 0,
      SUBCONTRACTOR: 0,
      OTHER: 0,
    };

    const costCodeMap = new Map<
      string,
      { costCode: string; name: string; actualAmount: number }
    >();

    for (const tx of transactions) {
      const amt = Number(tx.amount);
      totalActualCost += amt;
      byType[tx.transactionType] = (byType[tx.transactionType] || 0) + amt;

      const codeKey = tx.costCodeId;
      const existing = costCodeMap.get(codeKey);
      if (existing) {
        existing.actualAmount += amt;
      } else {
        costCodeMap.set(codeKey, {
          costCode: tx.costCode?.code ?? "UNKNOWN",
          name: tx.costCode?.name ?? "Unknown Code",
          actualAmount: amt,
        });
      }
    }

    const byCostCode = Array.from(costCodeMap.entries()).map(
      ([costCodeId, info]) => ({
        costCodeId,
        costCode: info.costCode,
        name: info.name,
        actualAmount: info.actualAmount,
      }),
    );

    return {
      projectId,
      totalActualCost,
      byType,
      byCostCode,
    };
  }
}

export const costTransactionService = new CostTransactionService();
