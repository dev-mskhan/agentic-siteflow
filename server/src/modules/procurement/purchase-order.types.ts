import type {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
} from "@prisma/client";

export type PurchaseOrderRecord = PurchaseOrder;
export type PurchaseOrderItemRecord = PurchaseOrderItem;

export interface CreatePurchaseOrderItemInput {
  materialId?: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  costCodeId?: string;
  linkedTaskId?: string;
  linkedBoqItemId?: string;
}

export interface CreatePurchaseOrderInput {
  projectId: string;
  vendorId: string;
  materialRequestId?: string;
  expectedDeliveryDate?: Date;
  currency?: string;
  taxRate?: number;
  shippingAmount?: number;
  paymentTerms?: string;
  shippingAddress?: string;
  notes?: string;
  items: CreatePurchaseOrderItemInput[];
}

export interface PurchaseOrderFilters {
  status?: PurchaseOrderStatus;
  vendorId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const PURCHASE_ORDER_AUDIT_ACTIONS = {
  PURCHASE_ORDER_CREATED: "PURCHASE_ORDER_CREATED",
  PURCHASE_ORDER_ISSUED: "PURCHASE_ORDER_ISSUED",
  PURCHASE_ORDER_CANCELLED: "PURCHASE_ORDER_CANCELLED",
  PURCHASE_ORDER_STATUS_CHANGED: "PURCHASE_ORDER_STATUS_CHANGED",
} as const;

export const PURCHASE_ORDER_DOMAIN_EVENTS = {
  MATERIAL_ORDERED: "MaterialOrdered",
} as const;

export const PURCHASE_ORDER_STATUS_TRANSITIONS: Record<
  PurchaseOrderStatus,
  PurchaseOrderStatus[]
> = {
  DRAFT: ["ISSUED", "CANCELLED"],
  ISSUED: ["PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  PARTIALLY_RECEIVED: ["RECEIVED"],
  RECEIVED: [],
  CANCELLED: [],
};
