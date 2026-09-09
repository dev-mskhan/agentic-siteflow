import { CostTransactionStatus, Prisma, type CostTransaction } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type {
  CostTransactionDetail,
  CostTransactionFilters,
  RecordCostTransactionInput,
} from "./cost-transaction.types.js";

export class CostTransactionRepository {
  async create(
    orgId: string,
    createdById: string,
    input: RecordCostTransactionInput,
    tx?: Prisma.TransactionClient,
  ): Promise<CostTransaction> {
    const client = tx ?? db;
    return client.costTransaction.create({
      data: {
        orgId,
        projectId: input.projectId,
        costCodeId: input.costCodeId,
        transactionType: input.transactionType,
        status: CostTransactionStatus.POSTED,
        amount: new Prisma.Decimal(input.amount),
        currency: input.currency ?? "USD",
        transactionDate: input.transactionDate,
        description: input.description,
        referenceNumber: input.referenceNumber,
        vendorId: input.vendorId,
        subcontractorId: input.subcontractorId,
        purchaseOrderId: input.purchaseOrderId,
        taskId: input.taskId,
        invoiceId: input.invoiceId,
        createdById,
      },
    });
  }

  async findById(orgId: string, id: string): Promise<CostTransactionDetail | null> {
    return db.costTransaction.findFirst({
      where: { id, orgId },
      include: {
        costCode: {
          select: { id: true, code: true, name: true },
        },
        vendor: {
          select: { id: true, name: true },
        },
        subcontractor: {
          select: { id: true, companyName: true },
        },
        purchaseOrder: {
          select: { id: true, poNumber: true },
        },
        task: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async list(
    orgId: string,
    filters: CostTransactionFilters = {},
  ): Promise<CostTransactionDetail[]> {
    const {
      projectId,
      costCodeId,
      transactionType,
      status,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
    } = filters;

    const where: Prisma.CostTransactionWhereInput = {
      orgId,
      ...(projectId && { projectId }),
      ...(costCodeId && { costCodeId }),
      ...(transactionType && { transactionType }),
      ...(status && { status }),
      ...(startDate || endDate
        ? {
            transactionDate: {
              ...(startDate && { gte: startDate }),
              ...(endDate && { lte: endDate }),
            },
          }
        : {}),
    };

    return db.costTransaction.findMany({
      where,
      include: {
        costCode: {
          select: { id: true, code: true, name: true },
        },
        vendor: {
          select: { id: true, name: true },
        },
        subcontractor: {
          select: { id: true, companyName: true },
        },
        purchaseOrder: {
          select: { id: true, poNumber: true },
        },
        task: {
          select: { id: true, name: true },
        },
      },
      orderBy: { transactionDate: "desc" },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Voids a cost transaction. Both `id` and `orgId` are included in the WHERE clause
   * so the DB itself enforces tenant scope — if the transaction belongs to a different
   * org, Prisma throws a not-found error rather than silently mutating cross-tenant data.
   */
  async voidTransaction(
    orgId: string,
    id: string,
    voidedById: string,
    voidReason: string,
  ): Promise<CostTransaction> {
    return db.costTransaction.update({
      where: { id, orgId },
      data: {
        status: CostTransactionStatus.VOID,
        voidedById,
        voidReason,
      },
    });
  }

  /**
   * Groups POSTED transactions by `transactionType` and sums `amount` at the DB level.
   * Returns one row per type that has at least one posted transaction.
   */
  async groupByType(
    orgId: string,
    projectId: string,
  ) {
    return db.costTransaction.groupBy({
      by: ["transactionType"],
      where: {
        orgId,
        projectId,
        status: CostTransactionStatus.POSTED,
      },
      _sum: { amount: true },
    });
  }

  /**
   * Groups POSTED transactions by `costCodeId` and sums `amount` at the DB level.
   * Also fetches the costCode relation so the caller gets `code` and `name` without
   * a second round-trip.
   */
  async groupByCostCode(
    orgId: string,
    projectId: string,
  ): Promise<
    Array<{
      costCodeId: string;
      totalAmount: Prisma.Decimal;
      costCode: { code: string; name: string };
    }>
  > {
    const rows = await db.costTransaction.groupBy({
      by: ["costCodeId"],
      where: {
        orgId,
        projectId,
        status: CostTransactionStatus.POSTED,
      },
      _sum: { amount: true },
    });

    if (rows.length === 0) return [];

    // Fetch costCode details in a single batched query
    const costCodeIds = rows.map((r) => r.costCodeId);
    const costCodes = await db.costCode.findMany({
      where: { id: { in: costCodeIds } },
      select: { id: true, code: true, name: true },
    });
    const costCodeById = new Map(costCodes.map((c) => [c.id, c]));

    return rows.map((r) => {
      const cc = costCodeById.get(r.costCodeId);
      return {
        costCodeId: r.costCodeId,
        totalAmount: r._sum.amount ?? new Prisma.Decimal(0),
        costCode: {
          code: cc?.code ?? "UNKNOWN",
          name: cc?.name ?? "Unknown Code",
        },
      };
    });
  }

  /** @deprecated Use groupByType + groupByCostCode for DB-level aggregation. */
  async aggregateActualCosts(
    orgId: string,
    projectId: string,
  ): Promise<Array<{ costCodeId: string; amount: Prisma.Decimal }>> {
    const rows = await this.groupByCostCode(orgId, projectId);
    return rows.map((r) => ({ costCodeId: r.costCodeId, amount: r.totalAmount }));
  }
}

export const costTransactionRepository = new CostTransactionRepository();
