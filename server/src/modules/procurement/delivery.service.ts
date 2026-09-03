import type { Delivery } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../common/AppError.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import {
  deliveryRepository as defaultDeliveryRepo,
  type DeliveryRepository,
  type DeliveryWithItems,
} from "./delivery.repository.js";
import {
  purchaseOrderRepository as defaultPurchaseOrderRepo,
  type PurchaseOrderRepository,
} from "./purchase-order.repository.js";
import {
  DELIVERY_AUDIT_ACTIONS,
  DELIVERY_DOMAIN_EVENTS,
  type DeliveryFilters,
  type ReceiveDeliveryInput,
  type RecordDelayInput,
  type ScheduleDeliveryInput,
} from "./delivery.types.js";

export class DeliveryService {
  constructor(
    private readonly repo: DeliveryRepository = defaultDeliveryRepo,
    private readonly audit: AuditService = defaultAuditService,
    private readonly poRepo: PurchaseOrderRepository = defaultPurchaseOrderRepo,
  ) {}

  /**
   * 5.6.7 — Schedule a delivery from an issued or partially received PO.
   */
  async scheduleDelivery(
    orgId: string,
    poId: string,
    userId: string,
    input: ScheduleDeliveryInput,
  ): Promise<DeliveryWithItems> {
    const po = await this.poRepo.findById(orgId, poId);
    if (!po || po.orgId !== orgId) {
      throw new NotFoundError("Purchase order not found");
    }

    if (po.status !== "ISSUED" && po.status !== "PARTIALLY_RECEIVED") {
      throw new ValidationError(
        `Cannot schedule delivery for Purchase Order in '${po.status}' status. PO must be ISSUED or PARTIALLY_RECEIVED.`,
      );
    }

    if (!input.items || input.items.length === 0) {
      throw new ValidationError("At least one item must be included in delivery");
    }

    for (const item of input.items) {
      if (item.quantityShipped <= 0) {
        throw new ValidationError("Shipped quantity must be greater than zero");
      }
    }

    const count = await this.repo.countByOrg(orgId);
    const deliveryNumber = `DEL-${String(count + 1).padStart(4, "0")}`;

    const delivery = await this.repo.create(
      orgId,
      po.projectId,
      po.id,
      deliveryNumber,
      input,
    );

    await this.audit.log({
      orgId,
      userId,
      action: DELIVERY_AUDIT_ACTIONS.DELIVERY_SCHEDULED,
      entity: "delivery",
      entityId: delivery.id,
      newValue: {
        deliveryNumber,
        purchaseOrderId: po.id,
        expectedDate: delivery.expectedDate,
        itemCount: delivery.receiptItems.length,
      },
    });

    return delivery;
  }

  /**
   * 5.6.8 — Record delivery delay.
   * Calculates delayedDays, updates status to DELAYED, emits MaterialDelayed event.
   */
  async recordDelay(
    orgId: string,
    deliveryId: string,
    userId: string,
    input: RecordDelayInput,
  ): Promise<DeliveryWithItems> {
    const delivery = await this.getDelivery(orgId, deliveryId);

    if (!input.delayReason?.trim()) {
      throw new ValidationError("Delay reason is required");
    }

    const newDate = new Date(input.newExpectedDate);
    const origDate = new Date(delivery.expectedDate);
    const diffTime = newDate.getTime() - origDate.getTime();
    const delayedDays = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)));

    const updated = await this.repo.update(orgId, deliveryId, {
      expectedDate: newDate,
      delayReason: input.delayReason,
      delayedDays,
      isDelayed: true,
      status: "DELAYED",
    });

    // Domain event for schedule risk monitoring
    await this.audit.log({
      orgId,
      userId,
      action: DELIVERY_DOMAIN_EVENTS.MATERIAL_DELAYED,
      entity: "domain_event",
      entityId: delivery.id,
      newValue: {
        deliveryId: delivery.id,
        deliveryNumber: delivery.deliveryNumber,
        purchaseOrderId: delivery.purchaseOrderId,
        delayedDays,
        delayReason: input.delayReason,
        newExpectedDate: newDate,
      },
    });

    await this.audit.log({
      orgId,
      userId,
      action: DELIVERY_AUDIT_ACTIONS.DELIVERY_DELAYED,
      entity: "delivery",
      entityId: delivery.id,
      oldValue: { expectedDate: delivery.expectedDate },
      newValue: { expectedDate: newDate, delayedDays, delayReason: input.delayReason },
    });

    return updated;
  }

  /**
   * 5.6.9 — Receive a delivery on site.
   * Updates quantities, PO item progress, and emits MaterialDelivered event.
   */
  async receiveDelivery(
    orgId: string,
    deliveryId: string,
    userId: string,
    input: ReceiveDeliveryInput,
  ): Promise<DeliveryWithItems> {
    const delivery = await this.getDelivery(orgId, deliveryId);

    if (delivery.status === "DELIVERED") {
      throw new ValidationError("Delivery has already been marked as DELIVERED");
    }

    if (!input.receipts || input.receipts.length === 0) {
      throw new ValidationError("At least one receipt item must be processed");
    }

    // Validate receipts
    for (const receipt of input.receipts) {
      if (receipt.quantityReceived < 0) {
        throw new ValidationError("Quantity received cannot be negative");
      }
      if (receipt.quantityAccepted < 0 || receipt.quantityRejected < 0) {
        throw new ValidationError("Accepted and rejected quantities cannot be negative");
      }
      if (receipt.quantityAccepted + receipt.quantityRejected > receipt.quantityReceived) {
        throw new ValidationError(
          `Sum of accepted (${receipt.quantityAccepted}) and rejected (${receipt.quantityRejected}) quantities cannot exceed quantity received (${receipt.quantityReceived})`,
        );
      }
    }

    // Map to items and determine delivery status
    let totalAccepted = 0;
    let totalRejected = 0;
    let totalShipped = 0;

    const receiptUpdates = input.receipts.map((rcpt) => {
      const existingItem = delivery.receiptItems.find((ri) => ri.id === rcpt.receiptItemId);
      if (!existingItem) {
        throw new ValidationError(`Receipt item '${rcpt.receiptItemId}' not found in delivery`);
      }

      totalAccepted += rcpt.quantityAccepted;
      totalRejected += rcpt.quantityRejected;
      totalShipped += Number(existingItem.quantityShipped);

      return {
        id: rcpt.receiptItemId,
        poItemId: existingItem.poItemId,
        quantityReceived: rcpt.quantityReceived,
        quantityAccepted: rcpt.quantityAccepted,
        quantityRejected: rcpt.quantityRejected,
        rejectionReason: rcpt.rejectionReason,
        notes: rcpt.notes,
      };
    });

    let deliveryStatus: Delivery["status"];
    if (totalAccepted > 0 && totalAccepted >= totalShipped) {
      deliveryStatus = "DELIVERED";
    } else if (totalAccepted === 0 && totalRejected > 0) {
      deliveryStatus = "REJECTED";
    } else {
      deliveryStatus = "PARTIALLY_RECEIVED";
    }

    const actualDate = input.actualDate ?? new Date();

    const updated = await this.repo.executeReceive(
      orgId,
      deliveryId,
      delivery.purchaseOrderId,
      userId,
      actualDate,
      input.deliveryNoteNumber,
      deliveryStatus,
      receiptUpdates,
    );

    // Domain event
    await this.audit.log({
      orgId,
      userId,
      action: DELIVERY_DOMAIN_EVENTS.MATERIAL_DELIVERED,
      entity: "domain_event",
      entityId: delivery.id,
      newValue: {
        deliveryId: delivery.id,
        deliveryNumber: delivery.deliveryNumber,
        purchaseOrderId: delivery.purchaseOrderId,
        status: deliveryStatus,
        totalAccepted,
        totalRejected,
        actualDate,
      },
    });

    await this.audit.log({
      orgId,
      userId,
      action: DELIVERY_AUDIT_ACTIONS.DELIVERY_RECEIVED,
      entity: "delivery",
      entityId: delivery.id,
      oldValue: { status: delivery.status },
      newValue: {
        status: deliveryStatus,
        actualDate,
        totalAccepted,
        totalRejected,
      },
    });

    return updated;
  }

  async getDelivery(orgId: string, deliveryId: string): Promise<DeliveryWithItems> {
    const delivery = await this.repo.findById(orgId, deliveryId);
    if (!delivery || delivery.orgId !== orgId) {
      throw new NotFoundError("Delivery not found");
    }
    return delivery;
  }

  async listDeliveriesByPO(orgId: string, poId: string): Promise<DeliveryWithItems[]> {
    return this.repo.findByPO(orgId, poId);
  }

  async listDeliveriesByProject(
    orgId: string,
    projectId: string,
    filters: DeliveryFilters = {},
  ): Promise<Delivery[]> {
    return this.repo.findByProject(orgId, projectId, filters);
  }
}

export const deliveryService = new DeliveryService();
