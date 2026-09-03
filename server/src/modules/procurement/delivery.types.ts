import type { Delivery, DeliveryReceiptItem, DeliveryStatus } from "@prisma/client";

export type DeliveryRecord = Delivery;
export type DeliveryReceiptItemRecord = DeliveryReceiptItem;

export interface ScheduleDeliveryItemInput {
  poItemId: string;
  quantityShipped: number;
}

export interface ScheduleDeliveryInput {
  expectedDate: Date;
  deliveryNoteNumber?: string;
  carrier?: string;
  trackingNumber?: string;
  notes?: string;
  items: ScheduleDeliveryItemInput[];
}

export interface RecordDelayInput {
  newExpectedDate: Date;
  delayReason: string;
}

export interface ReceiptItemInput {
  receiptItemId: string;
  quantityReceived: number;
  quantityAccepted: number;
  quantityRejected: number;
  rejectionReason?: string;
  notes?: string;
}

export interface ReceiveDeliveryInput {
  actualDate?: Date;
  deliveryNoteNumber?: string;
  receipts: ReceiptItemInput[];
}

export interface DeliveryFilters {
  status?: DeliveryStatus;
  isDelayed?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export const DELIVERY_AUDIT_ACTIONS = {
  DELIVERY_SCHEDULED: "DELIVERY_SCHEDULED",
  DELIVERY_DELAYED: "DELIVERY_DELAYED",
  DELIVERY_RECEIVED: "DELIVERY_RECEIVED",
  DELIVERY_STATUS_CHANGED: "DELIVERY_STATUS_CHANGED",
} as const;

export const DELIVERY_DOMAIN_EVENTS = {
  MATERIAL_DELAYED: "MaterialDelayed",
  MATERIAL_DELIVERED: "MaterialDelivered",
} as const;
