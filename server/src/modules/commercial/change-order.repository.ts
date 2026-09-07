import { ChangeOrderStatus, ChangeOrderType, Prisma, type ChangeOrder } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type {
  ChangeOrderDetail,
  ChangeOrderFilters,
  CreateChangeOrderInput,
} from "./change-order.types.js";

export class ChangeOrderRepository {
  async getNextNumber(projectId: string, tx?: Prisma.TransactionClient): Promise<string> {
    const client = tx ?? db;
    const count = await client.changeOrder.count({
      where: { projectId },
    });
    const seq = (count + 1).toString().padStart(3, "0");
    return `CO-${seq}`;
  }

  async create(
    orgId: string,
    requestedById: string,
    input: CreateChangeOrderInput,
  ): Promise<ChangeOrderDetail> {
    return db.$transaction(async (tx) => {
      const changeOrderNumber = await this.getNextNumber(input.projectId, tx);

      // Compute items and total cost delta
      let totalCostDelta = new Prisma.Decimal(0);
      const itemsData = input.items.map((item) => {
        const qty = new Prisma.Decimal(item.quantity);
        const price = new Prisma.Decimal(item.unitPrice);
        const amount = qty.mul(price);
        totalCostDelta = totalCostDelta.add(amount);

        return {
          orgId,
          costCodeId: item.costCodeId,
          description: item.description,
          quantity: qty,
          unitPrice: price,
          amount,
        };
      });

      const changeOrder = await tx.changeOrder.create({
        data: {
          orgId,
          projectId: input.projectId,
          changeOrderNumber,
          title: input.title,
          description: input.description,
          reason: input.reason,
          type: input.type ?? ChangeOrderType.CLIENT,
          status: ChangeOrderStatus.DRAFT,
          costDelta: totalCostDelta,
          scheduleDeltaDays: input.scheduleDeltaDays ?? 0,
          subcontractorId: input.subcontractorId,
          contractId: input.contractId,
          requestedById,
          items: {
            create: itemsData,
          },
        },
        include: {
          items: true,
          requestedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      return changeOrder;
    });
  }

  async findById(orgId: string, id: string): Promise<ChangeOrderDetail | null> {
    return db.changeOrder.findFirst({
      where: { id, orgId },
      include: {
        items: true,
        requestedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        subcontractor: {
          select: { id: true, companyName: true },
        },
        contract: {
          select: { id: true, contractNumber: true },
        },
      },
    });
  }

  async list(
    orgId: string,
    filters: ChangeOrderFilters = {},
  ): Promise<ChangeOrderDetail[]> {
    const { projectId, type, status, subcontractorId, limit = 50, offset = 0 } = filters;

    return db.changeOrder.findMany({
      where: {
        orgId,
        ...(projectId && { projectId }),
        ...(type && { type }),
        ...(status && { status }),
        ...(subcontractorId && { subcontractorId }),
      },
      include: {
        items: true,
        requestedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        subcontractor: {
          select: { id: true, companyName: true },
        },
        contract: {
          select: { id: true, contractNumber: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  async updateStatus(
    id: string,
    data: Prisma.ChangeOrderUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ChangeOrder> {
    const client = tx ?? db;
    return client.changeOrder.update({
      where: { id },
      data,
    });
  }
}

export const changeOrderRepository = new ChangeOrderRepository();
