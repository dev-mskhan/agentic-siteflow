import { CostTransactionStatus, PurchaseOrderStatus, SubcontractorContractStatus } from "@prisma/client";
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
    return db.costTransaction.findMany({
      where: {
        orgId,
        projectId,
        status: CostTransactionStatus.POSTED,
      },
      select: {
        costCodeId: true,
        amount: true,
      },
    });
  }

  async listOrgProjects(orgId: string) {
    return db.project.findMany({
      where: { orgId },
      select: { id: true, name: true, currency: true, plannedStartDate: true, plannedEndDate: true },
    });
  }
}

export const financialVarianceRepository = new FinancialVarianceRepository();
