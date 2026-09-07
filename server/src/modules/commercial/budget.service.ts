import type { BudgetItem } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../common/AppError.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import { projectRepository as defaultProjectRepository, type ProjectRepository } from "../projects/project.repository.js";
import { budgetRepository as defaultBudgetRepository, type BudgetRepository } from "./budget.repository.js";
import {
  BUDGET_AUDIT_ACTIONS,
  type BudgetItemDetail,
  type ProjectBudgetSummary,
  type SetProjectBudgetInput,
  type UpdateBudgetItemInput,
} from "./budget.types.js";

export class BudgetService {
  constructor(
    private readonly budgetRepo: BudgetRepository = defaultBudgetRepository,
    private readonly projectRepo: ProjectRepository = defaultProjectRepository,
    private readonly audit: AuditService = defaultAuditService,
  ) {}

  async setBudget(
    orgId: string,
    userId: string,
    input: SetProjectBudgetInput,
  ): Promise<BudgetItem[]> {
    const project = await this.projectRepo.findById(orgId, input.projectId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }

    if (!input.items || input.items.length === 0) {
      throw new ValidationError("At least one budget item is required");
    }

    for (const item of input.items) {
      if (item.originalAmount < 0) {
        throw new ValidationError("Budget item amount cannot be negative");
      }
    }

    const items = await this.budgetRepo.upsertBudgetItems(
      orgId,
      input.projectId,
      userId,
      input.items,
    );

    await this.audit.log({
      orgId,
      userId,
      action: BUDGET_AUDIT_ACTIONS.BUDGET_INITIALIZED,
      entity: "ProjectBudget",
      entityId: input.projectId,
      newValue: { count: items.length, items },
    });

    return items;
  }

  async getProjectBudget(
    orgId: string,
    projectId: string,
  ): Promise<ProjectBudgetSummary> {
    const project = await this.projectRepo.findById(orgId, projectId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }

    const items = await this.budgetRepo.listByProject(orgId, projectId);

    const totalOriginalAmount = items.reduce(
      (sum, it) => sum + Number(it.originalAmount),
      0,
    );
    const totalApprovedChanges = items.reduce(
      (sum, it) => sum + Number(it.approvedChanges),
      0,
    );
    const totalRevisedAmount = items.reduce(
      (sum, it) => sum + Number(it.revisedAmount),
      0,
    );

    const projectBudgetNum = project.budget ? Number(project.budget) : null;
    const varianceToProjectBudget = projectBudgetNum !== null
      ? projectBudgetNum - totalRevisedAmount
      : 0;

    return {
      projectId,
      projectBudget: projectBudgetNum,
      totalOriginalAmount,
      totalApprovedChanges,
      totalRevisedAmount,
      itemsCount: items.length,
      varianceToProjectBudget,
      isAllocatedUnderBudget: projectBudgetNum !== null ? totalRevisedAmount <= projectBudgetNum : true,
      items,
    };
  }

  async updateBudgetItem(
    orgId: string,
    userId: string,
    id: string,
    input: UpdateBudgetItemInput,
  ): Promise<BudgetItem> {
    const existing = await this.budgetRepo.findById(orgId, id);
    if (!existing) {
      throw new NotFoundError("Budget item not found");
    }

    if (input.originalAmount !== undefined && input.originalAmount < 0) {
      throw new ValidationError("Budget amount cannot be negative");
    }

    const updated = await this.budgetRepo.updateItem(orgId, id, input);

    await this.audit.log({
      orgId,
      userId,
      action: BUDGET_AUDIT_ACTIONS.BUDGET_ITEM_UPDATED,
      entity: "BudgetItem",
      entityId: id,
      oldValue: {
        originalAmount: Number(existing.originalAmount),
        revisedAmount: Number(existing.revisedAmount),
        notes: existing.notes,
      },
      newValue: {
        originalAmount: Number(updated.originalAmount),
        revisedAmount: Number(updated.revisedAmount),
        notes: updated.notes,
      },
    });

    return updated;
  }

  async listBudgetItems(
    orgId: string,
    projectId: string,
  ): Promise<BudgetItemDetail[]> {
    const project = await this.projectRepo.findById(orgId, projectId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }
    return this.budgetRepo.listByProject(orgId, projectId);
  }
}

export const budgetService = new BudgetService();
