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

  async voidTransaction(
    orgId: string,
    id: string,
    voidedById: string,
    voidReason: string,
  ): Promise<CostTransaction> {
    return db.costTransaction.update({
      where: { id },
      data: {
        status: CostTransactionStatus.VOID,
        voidedById,
        voidReason,
      },
    });
  }

  async aggregateActualCosts(
    orgId: string,
    projectId: string,
  ): Promise<Array<{ costCodeId: string; amount: Prisma.Decimal }>> {
    const records = await db.costTransaction.findMany({
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

    const map = new Map<string, Prisma.Decimal>();
    for (const r of records) {
      const curr = map.get(r.costCodeId) ?? new Prisma.Decimal(0);
      map.set(r.costCodeId, curr.add(r.amount));
    }

    return Array.from(map.entries()).map(([costCodeId, amount]) => ({
      costCodeId,
      amount,
    }));
  }
}

export const costTransactionRepository = new CostTransactionRepository();
