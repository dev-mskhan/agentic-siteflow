import { CostTransactionStatus, Prisma, PurchaseOrderStatus, SubcontractorContractStatus } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";

export class FinancialVarianceRepository {
  async getProjectBudgetItems(orgId: string, projectId: string) {
    return db.budgetItem.findMany({
      where: { orgId, projectId },
      include: {
        costCode: {
          select: { id: true, code: true, name: true, category: true },
        },
      },
    });
  }

  async getProjectCommittedCosts(orgId: string, projectId: string) {
    // 1. Purchase Orders (excluding cancelled/draft)
    const pos = await db.purchaseOrderItem.findMany({
      where: {
        purchaseOrder: {
          orgId,
          projectId,
          status: {
            in: [
              PurchaseOrderStatus.ISSUED,
              PurchaseOrderStatus.PARTIALLY_RECEIVED,
              PurchaseOrderStatus.RECEIVED,
            ],
          },
        },
      },
      select: {
        costCodeId: true,
        totalPrice: true,
      },
    });

    // 2. Subcontractor Contracts (excluding terminated/draft)
    const contracts = await db.subcontractorContract.findMany({
      where: {
        orgId,
        projectId,
        status: {
          in: [
            SubcontractorContractStatus.ACTIVE,
            SubcontractorContractStatus.COMPLETED,
          ],
        },
      },
      select: {
        costCodeId: true,
        contractValue: true,
      },
    });

    return { pos, contracts };
  }

  async getProjectActualCosts(orgId: string, projectId: string) {
    // Aggregate at DB level instead of pulling all rows — G15 fix
    const grouped = await db.costTransaction.groupBy({
      by: ["costCodeId"],
      where: {
        orgId,
        projectId,
        status: CostTransactionStatus.POSTED,
      },
      _sum: {
        amount: true,
      },
    });
    // Return in the same shape callers expect: { costCodeId, amount }
    return grouped.map((row) => ({
      costCodeId: row.costCodeId,
      amount: row._sum.amount ?? new Prisma.Decimal(0),
    }));
  }

  async listOrgProjects(orgId: string) {
    // TODO: If org has >200 projects, migrate to cursor-based pagination
    return db.project.findMany({
      where: { orgId },
      select: { id: true, name: true, currency: true, plannedStartDate: true, plannedEndDate: true },
      take: 200,
      orderBy: { name: "asc" },
    });
  }
}

export const financialVarianceRepository = new FinancialVarianceRepository();
