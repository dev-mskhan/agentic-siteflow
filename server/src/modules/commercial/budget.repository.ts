import { Prisma, type BudgetItem } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type { BudgetItemDetail, BudgetItemInput } from "./budget.types.js";

export class BudgetRepository {
  async findByProjectAndCostCode(
    orgId: string,
    projectId: string,
    costCodeId: string,
  ): Promise<BudgetItem | null> {
    return db.budgetItem.findFirst({
      where: { orgId, projectId, costCodeId },
    });
  }

  async findById(orgId: string, id: string): Promise<BudgetItemDetail | null> {
    return db.budgetItem.findFirst({
      where: { id, orgId },
      include: {
        costCode: {
          select: {
            id: true,
            code: true,
            name: true,
            category: true,
          },
        },
      },
    });
  }

  async listByProject(orgId: string, projectId: string): Promise<BudgetItemDetail[]> {
    return db.budgetItem.findMany({
      where: { orgId, projectId },
      include: {
        costCode: {
          select: {
            id: true,
            code: true,
            name: true,
            category: true,
          },
        },
      },
      orderBy: { costCode: { code: "asc" } },
    });
  }

  async upsertBudgetItems(
    orgId: string,
    projectId: string,
    userId: string,
    items: BudgetItemInput[],
  ): Promise<BudgetItem[]> {
    return db.$transaction(async (tx) => {
      const results: BudgetItem[] = [];
      for (const item of items) {
        const existing = await tx.budgetItem.findFirst({
          where: { orgId, projectId, costCodeId: item.costCodeId },
        });

        if (existing) {
          const updated = await tx.budgetItem.update({
            where: { id: existing.id },
            data: {
              originalAmount: new Prisma.Decimal(item.originalAmount),
              revisedAmount: new Prisma.Decimal(item.originalAmount).add(existing.approvedChanges),
              notes: item.notes !== undefined ? item.notes : existing.notes,
            },
          });
          results.push(updated);
        } else {
          const created = await tx.budgetItem.create({
            data: {
              orgId,
              projectId,
              costCodeId: item.costCodeId,
              originalAmount: new Prisma.Decimal(item.originalAmount),
              approvedChanges: new Prisma.Decimal(0),
              revisedAmount: new Prisma.Decimal(item.originalAmount),
              notes: item.notes,
              createdById: userId,
            },
          });
          results.push(created);
        }
      }
      return results;
    });
  }

  async updateItem(
    orgId: string,
    id: string,
    data: { originalAmount?: number; notes?: string },
  ): Promise<BudgetItem> {
    const existing = await db.budgetItem.findFirst({
      where: { id, orgId },
    });
    if (!existing) {
      throw new Error(`Budget item not found`);
    }

    const newOriginal = data.originalAmount !== undefined
      ? new Prisma.Decimal(data.originalAmount)
      : existing.originalAmount;
    const newRevised = newOriginal.add(existing.approvedChanges);

    return db.budgetItem.update({
      where: { id },
      data: {
        originalAmount: newOriginal,
        revisedAmount: newRevised,
        notes: data.notes !== undefined ? data.notes : existing.notes,
      },
    });
  }

  async adjustApprovedChanges(
    orgId: string,
    projectId: string,
    costCodeId: string,
    delta: number | Prisma.Decimal,
    tx?: Prisma.TransactionClient,
  ): Promise<BudgetItem> {
    const client = tx ?? db;
    const existing = await client.budgetItem.findFirst({
      where: { orgId, projectId, costCodeId },
    });

    const changeDelta = new Prisma.Decimal(delta);

    if (existing) {
      const newApproved = existing.approvedChanges.add(changeDelta);
      const newRevised = existing.originalAmount.add(newApproved);
      return client.budgetItem.update({
        where: { id: existing.id },
        data: {
          approvedChanges: newApproved,
          revisedAmount: newRevised,
        },
      });
    } else {
      return client.budgetItem.create({
        data: {
          orgId,
          projectId,
          costCodeId,
          originalAmount: new Prisma.Decimal(0),
          approvedChanges: changeDelta,
          revisedAmount: changeDelta,
          createdById: "SYSTEM",
        },
      });
    }
  }
}

export const budgetRepository = new BudgetRepository();
