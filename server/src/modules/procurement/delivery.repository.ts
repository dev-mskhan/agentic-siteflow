import type { Delivery, DeliveryReceiptItem } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type {
  DeliveryFilters,
  ScheduleDeliveryInput,
} from "./delivery.types.js";

export type DeliveryWithItems = Delivery & {
  receiptItems: (DeliveryReceiptItem & {
    poItem?: {
      id: string;
      description: string;
      quantity: unknown;
      receivedQuantity: unknown;
      unit: string;
    };
  })[];
};

export class DeliveryRepository {
  async create(
    orgId: string,
    projectId: string,
    purchaseOrderId: string,
    deliveryNumber: string,
    input: ScheduleDeliveryInput,
  ): Promise<DeliveryWithItems> {
    return db.$transaction(async (tx) => {
      const delivery = await tx.delivery.create({
        data: {
          orgId,
          projectId,
          purchaseOrderId,
          deliveryNumber,
          expectedDate: input.expectedDate,
          deliveryNoteNumber: input.deliveryNoteNumber,
          carrier: input.carrier,
          trackingNumber: input.trackingNumber,
          notes: input.notes,
          status: "SCHEDULED",
        },
      });

      const receiptItems: DeliveryReceiptItem[] = [];
      for (const item of input.items) {
        const receiptItem = await tx.deliveryReceiptItem.create({
          data: {
            deliveryId: delivery.id,
            poItemId: item.poItemId,
            quantityShipped: item.quantityShipped,
          },
        });
        receiptItems.push(receiptItem);
      }

      return { ...delivery, receiptItems };
    });
  }

  async findById(orgId: string, id: string): Promise<DeliveryWithItems | null> {
    return db.delivery.findFirst({
      where: { id, orgId },
      include: {
        receiptItems: {
          include: {
            poItem: {
              select: {
                id: true,
                description: true,
                quantity: true,
                receivedQuantity: true,
                unit: true,
              },
            },
          },
        },
      },
    });
  }

  async findByPO(orgId: string, purchaseOrderId: string): Promise<DeliveryWithItems[]> {
    return db.delivery.findMany({
      where: { orgId, purchaseOrderId },
      include: {
        receiptItems: {
          include: {
            poItem: {
              select: {
                id: true,
                description: true,
                quantity: true,
                receivedQuantity: true,
                unit: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findByProject(
    orgId: string,
    projectId: string,
    filters: DeliveryFilters = {},
  ): Promise<Delivery[]> {
    const { status, isDelayed, search, limit = 50, offset = 0 } = filters;

    return db.delivery.findMany({
      where: {
        orgId,
        projectId,
        ...(status ? { status } : {}),
        ...(isDelayed !== undefined ? { isDelayed } : {}),
        ...(search
          ? {
              OR: [
                { deliveryNumber: { contains: search, mode: "insensitive" } },
                { trackingNumber: { contains: search, mode: "insensitive" } },
                { deliveryNoteNumber: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { receiptItems: true },
      orderBy: { expectedDate: "asc" },
      take: limit,
      skip: offset,
    });
  }

  async update(
    orgId: string,
    id: string,
    data: Partial<
      Pick<
        Delivery,
        | "status"
        | "expectedDate"
        | "actualDate"
        | "isDelayed"
        | "delayedDays"
        | "delayReason"
        | "receivedById"
        | "deliveryNoteNumber"
      >
    >,
  ): Promise<DeliveryWithItems> {
    return db.delivery.update({
      where: { id, orgId },
      data,
      include: { receiptItems: true },
    });
  }

  async executeReceive(
    orgId: string,
    deliveryId: string,
    purchaseOrderId: string,
    receivedById: string,
    actualDate: Date,
    deliveryNoteNumber: string | undefined,
    deliveryStatus: Delivery["status"],
    receiptUpdates: Array<{
      id: string;
      poItemId: string;
      quantityReceived: number;
      quantityAccepted: number;
      quantityRejected: number;
      rejectionReason?: string;
      notes?: string;
    }>,
  ): Promise<DeliveryWithItems> {
    return db.$transaction(async (tx) => {
      // 1. Update receipt items
      for (const update of receiptUpdates) {
        await tx.deliveryReceiptItem.update({
          where: { id: update.id },
          data: {
            quantityReceived: update.quantityReceived,
            quantityAccepted: update.quantityAccepted,
            quantityRejected: update.quantityRejected,
            rejectionReason: update.rejectionReason,
            notes: update.notes,
          },
        });

        // 2. Increment PurchaseOrderItem receivedQuantity
        if (update.quantityAccepted > 0) {
          await tx.purchaseOrderItem.update({
            where: { id: update.poItemId },
            data: {
              receivedQuantity: { increment: update.quantityAccepted },
            },
          });
        }
      }

      // 3. Update Delivery
      const updatedDelivery = await tx.delivery.update({
        where: { id: deliveryId, orgId },
        data: {
          status: deliveryStatus,
          actualDate,
          receivedById,
          ...(deliveryNoteNumber ? { deliveryNoteNumber } : {}),
        },
        include: {
          receiptItems: {
            include: {
              poItem: {
                select: {
                  id: true,
                  description: true,
                  quantity: true,
                  receivedQuantity: true,
                  unit: true,
                },
              },
            },
          },
        },
      });

      // 4. Check if all items on PO are fulfilled
      const poItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId },
      });

      const allFulfilled = poItems.every(
        (poi) => Number(poi.receivedQuantity) >= Number(poi.quantity),
      );
      const anyReceived = poItems.some((poi) => Number(poi.receivedQuantity) > 0);

      const targetPoStatus = allFulfilled
        ? "RECEIVED"
        : anyReceived
        ? "PARTIALLY_RECEIVED"
        : undefined;

      if (targetPoStatus) {
        await tx.purchaseOrder.update({
          where: { id: purchaseOrderId },
          data: { status: targetPoStatus },
        });
      }

      return updatedDelivery;
    });
  }

  async countByOrg(orgId: string): Promise<number> {
    return db.delivery.count({
      where: { orgId },
    });
  }
}

export const deliveryRepository = new DeliveryRepository();

