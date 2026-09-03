import type { PurchaseOrder } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../common/AppError.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import {
  purchaseOrderRepository as defaultPurchaseOrderRepo,
  type PurchaseOrderRepository,
  type PurchaseOrderWithItems,
} from "./purchase-order.repository.js";
import {
  materialRequestRepository as defaultMaterialRequestRepo,
  type MaterialRequestRepository,
} from "./material-request.repository.js";
import {
  PURCHASE_ORDER_AUDIT_ACTIONS,
  PURCHASE_ORDER_DOMAIN_EVENTS,
  PURCHASE_ORDER_STATUS_TRANSITIONS,
  type CreatePurchaseOrderInput,
  type PurchaseOrderFilters,
} from "./purchase-order.types.js";
import {
  calcPoSubtotal,
  calcTaxAmount,
  calcPoTotal,
} from "./po-calculation.js";

export class PurchaseOrderService {
  constructor(
    private readonly repo: PurchaseOrderRepository = defaultPurchaseOrderRepo,
    private readonly audit: AuditService = defaultAuditService,
    private readonly materialRequestRepo: MaterialRequestRepository = defaultMaterialRequestRepo,
  ) {}

  /**
   * 5.5.8 — Create a new Purchase Order.
   * Can be standalone or generated from an approved MaterialRequest.
   * Calculates subtotal, tax, and total. Generates sequential PO-0001.
   * If created from MaterialRequest, transitions request to PARTIALLY_FULFILLED.
   */
  async createPO(
    orgId: string,
    projectId: string,
    userId: string,
    input: CreatePurchaseOrderInput,
  ): Promise<PurchaseOrderWithItems> {
    if (!input.vendorId) {
      throw new ValidationError("Vendor is required");
    }

    if (!input.items || input.items.length === 0) {
      throw new ValidationError("At least one item is required");
    }

    for (const item of input.items) {
      if (item.quantity <= 0) {
        throw new ValidationError("Item quantity must be greater than zero");
      }
      if (item.unitPrice < 0) {
        throw new ValidationError("Item unit price cannot be negative");
      }
    }

    // If linked to a MaterialRequest, validate it exists and is APPROVED
    if (input.materialRequestId) {
      const mr = await this.materialRequestRepo.findById(orgId, input.materialRequestId);
      if (!mr || mr.orgId !== orgId) {
        throw new NotFoundError("Material request not found");
      }
      if (mr.status !== "APPROVED" && mr.status !== "PARTIALLY_FULFILLED") {
        throw new ValidationError(
          `Cannot create Purchase Order from Material Request in '${mr.status}' status. Must be APPROVED.`,
        );
      }
    }

    // Calculate finances
    const subtotal = calcPoSubtotal(input.items);
    const taxAmount = calcTaxAmount(subtotal, input.taxRate ?? 0);
    const totalAmount = calcPoTotal(subtotal, taxAmount, input.shippingAmount ?? 0);

    // Sequential PO numbering
    const count = await this.repo.countByOrg(orgId);
    const poNumber = `PO-${String(count + 1).padStart(4, "0")}`;

    const po = await this.repo.create(
      orgId,
      userId,
      poNumber,
      { ...input, projectId },
      { subtotal, taxAmount, totalAmount },
    );

    // If from MaterialRequest, update its status to PARTIALLY_FULFILLED if not already
    if (input.materialRequestId) {
      await this.materialRequestRepo.update(orgId, input.materialRequestId, {
        status: "PARTIALLY_FULFILLED",
      });
    }

    await this.audit.log({
      orgId,
      userId,
      action: PURCHASE_ORDER_AUDIT_ACTIONS.PURCHASE_ORDER_CREATED,
      entity: "purchase_order",
      entityId: po.id,
      newValue: {
        poNumber,
        vendorId: po.vendorId,
        totalAmount: totalAmount.toString(),
        itemCount: po.items.length,
      },
    });

    return po;
  }

  /**
   * 5.5.9 — Issue a Purchase Order.
   * Validates DRAFT status and at least one item.
   * Sets status=ISSUED, issueDate=now(), approvedById=userId, approvedAt=now().
   * Emits MaterialOrdered domain event and audit log.
   */
  async issuePO(
    orgId: string,
    poId: string,
    userId: string,
  ): Promise<PurchaseOrderWithItems> {
    const po = await this.getPO(orgId, poId);

    if (po.status !== "DRAFT") {
      throw new ValidationError(`Cannot issue a Purchase Order in status '${po.status}'`);
    }

    if (!po.items || po.items.length === 0) {
      throw new ValidationError("Cannot issue a Purchase Order with no items");
    }

    const now = new Date();
    const updated = await this.repo.update(orgId, poId, {
      status: "ISSUED",
      issueDate: now,
      approvedById: userId,
      approvedAt: now,
    });

    // Domain event emission
    await this.audit.log({
      orgId,
      userId,
      action: PURCHASE_ORDER_DOMAIN_EVENTS.MATERIAL_ORDERED,
      entity: "domain_event",
      entityId: po.id,
      newValue: {
        poId: po.id,
        poNumber: po.poNumber,
        vendorId: po.vendorId,
        projectId: po.projectId,
        totalAmount: po.totalAmount.toString(),
        expectedDeliveryDate: po.expectedDeliveryDate,
        itemCount: po.items.length,
      },
    });

    await this.audit.log({
      orgId,
      userId,
      action: PURCHASE_ORDER_AUDIT_ACTIONS.PURCHASE_ORDER_ISSUED,
      entity: "purchase_order",
      entityId: po.id,
      oldValue: { status: po.status },
      newValue: { status: "ISSUED", approvedById: userId, issueDate: now },
    });

    return updated;
  }

  /**
   * 5.5.10 — Cancel a Purchase Order.
   * Validates 0 received items (cannot cancel received goods).
   */
  async cancelPO(
    orgId: string,
    poId: string,
    userId: string,
    reason?: string,
  ): Promise<PurchaseOrderWithItems> {
    const po = await this.getPO(orgId, poId);

    this.validateTransition(po.status, "CANCELLED");

    // Check if any items have been received
    const hasReceived = po.items.some((item) => Number(item.receivedQuantity) > 0);
    if (hasReceived) {
      throw new ValidationError("Cannot cancel a Purchase Order that has received items");
    }

    const updated = await this.repo.update(orgId, poId, {
      status: "CANCELLED",
    });

    await this.audit.log({
      orgId,
      userId,
      action: PURCHASE_ORDER_AUDIT_ACTIONS.PURCHASE_ORDER_CANCELLED,
      entity: "purchase_order",
      entityId: po.id,
      oldValue: { status: po.status },
      newValue: { status: "CANCELLED", reason },
    });

    return updated;
  }

  /**
   * 5.5.11 — Get a single Purchase Order with items.
   */
  async getPO(orgId: string, poId: string): Promise<PurchaseOrderWithItems> {
    const po = await this.repo.findById(orgId, poId);
    if (!po || po.orgId !== orgId) {
      throw new NotFoundError("Purchase order not found");
    }
    return po;
  }

  /**
   * 5.5.11 — List Purchase Orders for a project.
   */
  async listPOs(
    orgId: string,
    projectId: string,
    filters: PurchaseOrderFilters = {},
  ): Promise<PurchaseOrder[]> {
    return this.repo.findByProject(orgId, projectId, filters);
  }

  private validateTransition(
    currentStatus: PurchaseOrder["status"],
    targetStatus: PurchaseOrder["status"],
  ): void {
    const allowed = PURCHASE_ORDER_STATUS_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw new ValidationError(
        `Cannot transition Purchase Order from ${currentStatus} to ${targetStatus}`,
      );
    }
  }
}

export const purchaseOrderService = new PurchaseOrderService();
