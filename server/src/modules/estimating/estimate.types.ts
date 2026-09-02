import type { EstimateStatus } from "@prisma/client";

export const ESTIMATE_STATUS_TRANSITIONS: Record<EstimateStatus, EstimateStatus[]> = {
  DRAFT: ["UNDER_REVIEW", "ARCHIVED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "DRAFT"],
  APPROVED: ["CONVERTED", "ARCHIVED"],
  REJECTED: ["DRAFT", "ARCHIVED"],
  CONVERTED: [],
  ARCHIVED: [],
};

export const EDITABLE_STATUSES: EstimateStatus[] = ["DRAFT", "REJECTED"];

export const ESTIMATE_AUDIT_ACTIONS = {
  ESTIMATE_CREATED: "ESTIMATE_CREATED",
  ESTIMATE_UPDATED: "ESTIMATE_UPDATED",
  ESTIMATE_STATUS_CHANGED: "ESTIMATE_STATUS_CHANGED",
  ESTIMATE_VERSION_CREATED: "ESTIMATE_VERSION_CREATED",
  ESTIMATE_PRICING_UPDATED: "ESTIMATE_PRICING_UPDATED",
  ESTIMATE_CONVERTED: "ESTIMATE_CONVERTED",
  BOQ_ITEM_ADDED: "BOQ_ITEM_ADDED",
  BOQ_ITEM_UPDATED: "BOQ_ITEM_UPDATED",
  BOQ_ITEM_DELETED: "BOQ_ITEM_DELETED",
  BOQ_ITEMS_REORDERED: "BOQ_ITEMS_REORDERED",
  RATE_CARD_CREATED: "RATE_CARD_CREATED",
  RATE_CARD_ITEM_ADDED: "RATE_CARD_ITEM_ADDED",
  RATE_CARD_DEACTIVATED: "RATE_CARD_DEACTIVATED",
  LABOR_RATE_CREATED: "LABOR_RATE_CREATED",
  LABOR_RATE_UPDATED: "LABOR_RATE_UPDATED",
  LABOR_RATE_DEACTIVATED: "LABOR_RATE_DEACTIVATED",
} as const;

export interface CreateEstimateInput {
  name: string;
  description?: string;
  clientName?: string;
  clientContact?: string;
  siteAddress?: string;
  siteCity?: string;
  siteCountry?: string;
  currency?: string;
  validUntil?: Date;
  notes?: string;
  scope?: string;
}

export interface UpdateEstimateInput {
  name?: string;
  description?: string;
  clientName?: string;
  clientContact?: string;
  siteAddress?: string;
  siteCity?: string;
  siteCountry?: string;
  currency?: string;
  validUntil?: Date;
  notes?: string;
  scope?: string;
}

export interface EstimateFilters {
  status?: EstimateStatus;
  limit?: number;
  offset?: number;
}
