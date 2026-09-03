import type {
  MaterialRequest,
  MaterialRequestItem,
  MaterialRequestStatus,
  MaterialRequestPriority,
} from "@prisma/client";

export type MaterialRequestRecord = MaterialRequest;
export type MaterialRequestItemRecord = MaterialRequestItem;

export interface CreateMaterialRequestItemInput {
  materialId?: string;
  description: string;
  quantity: number;
  unit: string;
  estimatedUnitCost?: number;
  costCodeId?: string;
  linkedTaskId?: string;
  linkedBoqItemId?: string;
}

export interface CreateMaterialRequestInput {
  title: string;
  priority?: MaterialRequestPriority;
  neededByDate: Date;
  deliveryLocation?: string;
  notes?: string;
  items: CreateMaterialRequestItemInput[];
}

export interface MaterialRequestFilters {
  status?: MaterialRequestStatus;
  priority?: MaterialRequestPriority;
  search?: string;
  limit?: number;
  offset?: number;
}

export const MATERIAL_REQUEST_AUDIT_ACTIONS = {
  MATERIAL_REQUEST_CREATED: "MATERIAL_REQUEST_CREATED",
  MATERIAL_REQUEST_SUBMITTED: "MATERIAL_REQUEST_SUBMITTED",
  MATERIAL_REQUEST_APPROVED: "MATERIAL_REQUEST_APPROVED",
  MATERIAL_REQUEST_REJECTED: "MATERIAL_REQUEST_REJECTED",
  MATERIAL_REQUEST_STATUS_CHANGED: "MATERIAL_REQUEST_STATUS_CHANGED",
} as const;

/**
 * Material Request status transition rules:
 *   DRAFT       → SUBMITTED, CANCELLED
 *   SUBMITTED   → APPROVED, REJECTED, DRAFT
 *   APPROVED    → PARTIALLY_FULFILLED, FULFILLED, CANCELLED
 *   PARTIALLY_FULFILLED → FULFILLED, CANCELLED
 *   FULFILLED   → (terminal)
 *   REJECTED    → DRAFT, CANCELLED
 *   CANCELLED   → (terminal)
 */
export const MATERIAL_REQUEST_STATUS_TRANSITIONS: Record<
  MaterialRequestStatus,
  MaterialRequestStatus[]
> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["APPROVED", "REJECTED", "DRAFT"],
  APPROVED: ["PARTIALLY_FULFILLED", "FULFILLED", "CANCELLED"],
  PARTIALLY_FULFILLED: ["FULFILLED", "CANCELLED"],
  FULFILLED: [],
  REJECTED: ["DRAFT", "CANCELLED"],
  CANCELLED: [],
};
