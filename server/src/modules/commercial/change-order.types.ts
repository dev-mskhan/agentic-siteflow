import type { ChangeOrder, ChangeOrderItem, ChangeOrderStatus, ChangeOrderType } from "@prisma/client";

export const CHANGE_ORDER_AUDIT_ACTIONS = {
  CHANGE_ORDER_CREATED: "CHANGE_ORDER_CREATED",
  CHANGE_ORDER_SUBMITTED: "CHANGE_ORDER_SUBMITTED",
  CHANGE_ORDER_APPROVED: "CHANGE_ORDER_APPROVED",
  CHANGE_ORDER_REJECTED: "CHANGE_ORDER_REJECTED",
  CHANGE_ORDER_VOIDED: "CHANGE_ORDER_VOIDED",
} as const;

export const CHANGE_ORDER_DOMAIN_EVENTS = {
  CHANGE_ORDER_CREATED: "ChangeOrderCreated",
  CHANGE_ORDER_APPROVED: "ChangeOrderApproved",
  CHANGE_ORDER_REJECTED: "ChangeOrderRejected",
} as const;

export interface ChangeOrderItemInput {
  costCodeId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateChangeOrderInput {
  projectId: string;
  title: string;
  description: string;
  reason?: string;
  type?: ChangeOrderType;
  scheduleDeltaDays?: number;
  subcontractorId?: string;
  contractId?: string;
  items: ChangeOrderItemInput[];
}

export interface UpdateChangeOrderInput {
  title?: string;
  description?: string;
  reason?: string;
  scheduleDeltaDays?: number;
}

export interface ApproveChangeOrderInput {
  id: string;
  clientReferenceNumber?: string;
  clientApproved?: boolean;
}

export interface RejectChangeOrderInput {
  id: string;
  rejectionReason: string;
}

export interface ChangeOrderFilters {
  projectId?: string;
  type?: ChangeOrderType;
  status?: ChangeOrderStatus;
  subcontractorId?: string;
  limit?: number;
  offset?: number;
}

export interface ChangeOrderDetail extends ChangeOrder {
  items: ChangeOrderItem[];
  requestedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  approvedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  subcontractor?: {
    id: string;
    companyName: string;
  } | null;
  contract?: {
    id: string;
    contractNumber: string;
  } | null;
}
