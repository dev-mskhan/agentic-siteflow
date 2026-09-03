import type { PurchaseOrder, PurchaseOrderItem } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type {
  CreatePurchaseOrderInput,
  CreatePurchaseOrderItemInput,
  PurchaseOrderFilters,
} from "./purchase-order.types.js";
import { calcItemTotal } from "./po-calculation.js";
import type { Prisma } from "@prisma/client";

export type PurchaseOrderWithItems = PurchaseOrder & {
  items: PurchaseOrderItem[];
};

export interface CreatePoData {
  subtotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}

export class PurchaseOrderRepository {
  async create(
    orgId: string,
    createdById: string,
    poNumber: string,
    input: CreatePurchaseOrderInput,
    calc: CreatePoData,
  ): Promise<PurchaseOrderWithItems> {
    return db.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          orgId,
          projectId: input.projectId,
          vendorId: input.vendorId,
          createdById,
          poNumber,
          materialRequestId: input.materialRequestId,
          expectedDeliveryDate: input.expectedDeliveryDate,
          currency: input.currency ?? "USD",
          taxRate: input.taxRate ?? 0,
          shippingAmount: input.shippingAmount ?? 0,
          subtotal: calc.subtotal,
          taxAmount: calc.taxAmount,
          totalAmount: calc.totalAmount,
          paymentTerms: input.paymentTerms,
          shippingAddress: input.shippingAddress,
          notes: input.notes,
        },
      });

      const items: PurchaseOrderItem[] = [];
      for (const item of input.items) {
        const totalPrice = calcItemTotal(item.quantity, item.unitPrice);
        const createdItem = await tx.purchaseOrderItem.create({
          data: {
            purchaseOrderId: po.id,
            materialId: item.materialId,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            totalPrice,
            costCodeId: item.costCodeId,
            linkedTaskId: item.linkedTaskId,
            linkedBoqItemId: item.linkedBoqItemId,
          },
        });
        items.push(createdItem);
      }

      return { ...po, items };
    });
  }

  async findById(orgId: string, id: string): Promise<PurchaseOrderWithItems | null> {
    return db.purchaseOrder.findFirst({
      where: { id, orgId },
      include: { items: true },
    });
  }

  async findByProject(
    orgId: string,
    projectId: string,
    filters: PurchaseOrderFilters = {},
  ): Promise<PurchaseOrder[]> {
    const { status, vendorId, search, limit = 50, offset = 0 } = filters;

    return db.purchaseOrder.findMany({
      where: {
        orgId,
        projectId,
        ...(status ? { status } : {}),
        ...(vendorId ? { vendorId } : {}),
        ...(search
          ? {
              OR: [
                { poNumber: { contains: search, mode: "insensitive" } },
                { notes: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  async findByVendor(orgId: string, vendorId: string): Promise<PurchaseOrder[]> {
    return db.purchaseOrder.findMany({
      where: { orgId, vendorId },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async update(
    orgId: string,
    id: string,
    data: Partial<
      Pick<
        PurchaseOrder,
        | "status"
        | "issueDate"
        | "approvedById"
        | "approvedAt"
        | "subtotal"
        | "taxAmount"
        | "totalAmount"
      >
    >,
  ): Promise<PurchaseOrderWithItems> {
    return db.purchaseOrder.update({
      where: { id, orgId },
      data,
      include: { items: true },
    });
  }

  async addItem(
    purchaseOrderId: string,
    input: CreatePurchaseOrderItemInput,
  ): Promise<PurchaseOrderItem> {
    const totalPrice = calcItemTotal(input.quantity, input.unitPrice);
    return db.purchaseOrderItem.create({
      data: {
        purchaseOrderId,
        materialId: input.materialId,
        description: input.description,
        quantity: input.quantity,
        unit: input.unit,
        unitPrice: input.unitPrice,
        totalPrice,
        costCodeId: input.costCodeId,
        linkedTaskId: input.linkedTaskId,
        linkedBoqItemId: input.linkedBoqItemId,
      },
    });
  }

  async countByOrg(orgId: string): Promise<number> {
    return db.purchaseOrder.count({
      where: { orgId },
    });
  }
}

export const purchaseOrderRepository = new PurchaseOrderRepository();
