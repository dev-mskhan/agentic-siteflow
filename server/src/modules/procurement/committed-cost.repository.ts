import { db } from "../../infrastructure/database/client.js";

export class CommittedCostRepository {
  async findProject(orgId: string, projectId: string) {
    return db.project.findFirst({
      where: { id: projectId, orgId },
      select: {
        id: true,
        name: true,
        currency: true,
        budget: true,
      },
    });
  }

  async findOrgProjects(orgId: string) {
    // TODO: cursor pagination if org has >200 projects (G15)
    return db.project.findMany({
      where: { orgId, status: { not: "CANCELLED" } },
      select: {
        id: true,
        name: true,
        currency: true,
        budget: true,
      },
      take: 200,
      orderBy: { name: "asc" },
    });
  }

  async getCommittedPurchaseOrders(orgId: string, projectId: string) {
    // Capped at 500 — projects with >500 active POs should migrate to DB-level aggregation (G15)
    return db.purchaseOrder.findMany({
      where: {
        orgId,
        projectId,
        status: { in: ["ISSUED", "PARTIALLY_RECEIVED", "RECEIVED"] },
      },
      select: {
        id: true,
        subtotal: true,
        totalAmount: true,
        items: {
          select: {
            id: true,
            totalPrice: true,
            costCodeId: true,
          },
        },
      },
      take: 500,
      orderBy: { createdAt: "desc" },
    });
  }

  async getCommittedSubcontractorContracts(orgId: string, projectId: string) {
    // Capped at 500 — projects with >500 active subcontractor contracts need DB-level aggregation (G15)
    return db.subcontractorContract.findMany({
      where: {
        orgId,
        projectId,
        status: { in: ["ACTIVE", "COMPLETED"] },
      },
      select: {
        id: true,
        contractValue: true,
        costCodeId: true,
      },
      take: 500,
      orderBy: { createdAt: "desc" },
    });
  }

  async getCostCodesByIds(orgId: string, costCodeIds: string[]) {
    if (costCodeIds.length === 0) return [];
    return db.costCode.findMany({
      where: {
        orgId,
        id: { in: costCodeIds },
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });
  }
}

export const committedCostRepository = new CommittedCostRepository();
