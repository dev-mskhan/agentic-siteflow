import { ChangeOrderStatus, type ChangeOrder } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../common/AppError.js";
import { db } from "../../infrastructure/database/client.js";
import { cacheDel, cacheKey } from "../../infrastructure/redis/cache.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import { projectRepository as defaultProjectRepository, type ProjectRepository } from "../projects/project.repository.js";
import { budgetRepository as defaultBudgetRepository, type BudgetRepository } from "./budget.repository.js";
import {
  changeOrderRepository as defaultChangeOrderRepo,
  type ChangeOrderRepository,
} from "./change-order.repository.js";
import {
  CHANGE_ORDER_AUDIT_ACTIONS,
  type ApproveChangeOrderInput,
  type ChangeOrderDetail,
  type ChangeOrderFilters,
  type CreateChangeOrderInput,
  type RejectChangeOrderInput,
} from "./change-order.types.js";
import { assertNotSelfApprover } from "./segregation.guard.js";

export class ChangeOrderService {
  constructor(
    private readonly changeOrderRepo: ChangeOrderRepository = defaultChangeOrderRepo,
    private readonly budgetRepo: BudgetRepository = defaultBudgetRepository,
    private readonly projectRepo: ProjectRepository = defaultProjectRepository,
    private readonly audit: AuditService = defaultAuditService,
  ) {}

  async create(
    orgId: string,
    userId: string,
    input: CreateChangeOrderInput,
  ): Promise<ChangeOrderDetail> {
    const project = await this.projectRepo.findById(orgId, input.projectId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }

    if (!input.title?.trim()) {
      throw new ValidationError("Title is required");
    }
    if (!input.items || input.items.length === 0) {
      throw new ValidationError("Change order must include at least one item");
    }

    const created = await this.changeOrderRepo.create(orgId, userId, input);

    await this.audit.log({
      orgId,
      userId,
      action: CHANGE_ORDER_AUDIT_ACTIONS.CHANGE_ORDER_CREATED,
      entity: "ChangeOrder",
      entityId: created.id,
      newValue: {
        number: created.changeOrderNumber,
        costDelta: Number(created.costDelta),
        scheduleDeltaDays: created.scheduleDeltaDays,
      },
    });

    return created;
  }

  async get(orgId: string, id: string): Promise<ChangeOrderDetail> {
    const co = await this.changeOrderRepo.findById(orgId, id);
    if (!co) {
      throw new NotFoundError("Change order not found");
    }
    return co;
  }

  async list(
    orgId: string,
    filters: ChangeOrderFilters = {},
  ): Promise<ChangeOrderDetail[]> {
    return this.changeOrderRepo.list(orgId, filters);
  }

  async submit(orgId: string, userId: string, id: string): Promise<ChangeOrder> {
    const co = await this.changeOrderRepo.findById(orgId, id);
    if (!co) {
      throw new NotFoundError("Change order not found");
    }

    if (co.status !== ChangeOrderStatus.DRAFT) {
      throw new ValidationError(`Cannot submit change order in '${co.status}' status`);
    }

    const updated = await this.changeOrderRepo.updateStatus(id, {
      status: ChangeOrderStatus.SUBMITTED,
    });

    await this.audit.log({
      orgId,
      userId,
      action: CHANGE_ORDER_AUDIT_ACTIONS.CHANGE_ORDER_SUBMITTED,
      entity: "ChangeOrder",
      entityId: id,
      oldValue: { status: co.status },
      newValue: { status: updated.status },
    });

    return updated;
  }

  async approve(
    orgId: string,
    userId: string,
    input: ApproveChangeOrderInput,
  ): Promise<ChangeOrder> {
    const co = await this.changeOrderRepo.findById(orgId, input.id);
    if (!co) {
      throw new NotFoundError("Change order not found");
    }

    if (
      co.status !== ChangeOrderStatus.SUBMITTED &&
      co.status !== ChangeOrderStatus.UNDER_REVIEW
    ) {
      throw new ValidationError(`Cannot approve change order in '${co.status}' status`);
    }

    // Segregation of duties: creator cannot approve
    assertNotSelfApprover(co.requestedById, userId, "change order");

    // Execute approval inside transaction:
    // 1. Update ChangeOrder status to APPROVED
    // 2. Adjust BudgetItem approvedChanges & revisedAmount for each line item cost code
    // 3. If contractId present, update SubcontractorContract.contractValue
    const approved = await db.$transaction(async (tx) => {
      const now = new Date();
      const updatedCo = await tx.changeOrder.update({
        where: { id: input.id },
        data: {
          status: ChangeOrderStatus.APPROVED,
          approvedById: userId,
          approvedAt: now,
          clientApprovedAt: input.clientApproved ? now : null,
          clientReferenceNumber: input.clientReferenceNumber,
        },
      });

      // Update budget items for each line item with a costCodeId
      for (const item of co.items) {
        if (item.costCodeId) {
          await this.budgetRepo.adjustApprovedChanges(
            orgId,
            co.projectId,
            item.costCodeId,
            item.amount,
            tx,
          );
        }
      }

      // Update SubcontractorContract contractValue if applicable
      if (co.contractId) {
        const contract = await tx.subcontractorContract.findUnique({
          where: { id: co.contractId },
        });
        if (contract) {
          const newContractValue = contract.contractValue.add(co.costDelta);
          await tx.subcontractorContract.update({
            where: { id: co.contractId },
            data: { contractValue: newContractValue },
          });
        }
      }

      return updatedCo;
    });

    await this.audit.log({
      orgId,
      userId,
      action: CHANGE_ORDER_AUDIT_ACTIONS.CHANGE_ORDER_APPROVED,
      entity: "ChangeOrder",
      entityId: input.id,
      oldValue: { status: co.status },
      newValue: {
        status: approved.status,
        approvedById: userId,
        costDelta: Number(co.costDelta),
      },
    });

    await cacheDel(
      cacheKey.projectBudget(co.projectId),
      cacheKey.financialOverview(co.projectId),
      cacheKey.orgFinancialOverview(orgId),
    );

    return approved;
  }

  async reject(
    orgId: string,
    userId: string,
    input: RejectChangeOrderInput,
  ): Promise<ChangeOrder> {
    const co = await this.changeOrderRepo.findById(orgId, input.id);
    if (!co) {
      throw new NotFoundError("Change order not found");
    }

    if (
      co.status !== ChangeOrderStatus.SUBMITTED &&
      co.status !== ChangeOrderStatus.UNDER_REVIEW
    ) {
      throw new ValidationError(`Cannot reject change order in '${co.status}' status`);
    }

    // Segregation of duties
    assertNotSelfApprover(co.requestedById, userId, "change order");

    const rejected = await this.changeOrderRepo.updateStatus(input.id, {
      status: ChangeOrderStatus.REJECTED,
      rejectionReason: input.rejectionReason,
    });

    await this.audit.log({
      orgId,
      userId,
      action: CHANGE_ORDER_AUDIT_ACTIONS.CHANGE_ORDER_REJECTED,
      entity: "ChangeOrder",
      entityId: input.id,
      oldValue: { status: co.status },
      newValue: { status: rejected.status, rejectionReason: input.rejectionReason },
    });

    return rejected;
  }
}

export const changeOrderService = new ChangeOrderService();
