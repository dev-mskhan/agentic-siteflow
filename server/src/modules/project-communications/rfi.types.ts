import type { Rfi, RfiDiscipline, RfiPriority, RfiResponse, RfiStatus } from "@prisma/client";

export type RfiRecord = Rfi;
export type RfiResponseRecord = RfiResponse;

export interface CreateRfiInput {
  projectId: string;
  title: string;
  question: string;
  suggestedSolution?: string;
  discipline?: RfiDiscipline;
  priority?: RfiPriority;
  dueDate?: Date;
  scheduleImpactDays?: number;
  costImpactAmount?: number;
  linkedTaskId?: string;
  assignedToId?: string;
}

export interface UpdateRfiInput {
  title?: string;
  question?: string;
  suggestedSolution?: string | null;
  discipline?: RfiDiscipline;
  priority?: RfiPriority;
  dueDate?: Date | null;
  scheduleImpactDays?: number | null;
  costImpactAmount?: number | null;
  linkedTaskId?: string | null;
  assignedToId?: string | null;
}

export interface AddRfiResponseInput {
  rfiId: string;
  responseContent: string;
  isOfficialAnswer?: boolean;
}

export interface RfiFilters {
  projectId?: string;
  status?: RfiStatus;
  discipline?: RfiDiscipline;
  priority?: RfiPriority;
  assignedToId?: string;
  requestedById?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const RFI_STATUS_TRANSITIONS: Record<RfiStatus, RfiStatus[]> = {
  DRAFT: ["OPEN", "REJECTED"],
  OPEN: ["UNDER_REVIEW", "ANSWERED", "REJECTED"],
  UNDER_REVIEW: ["ANSWERED", "REJECTED", "OPEN"],
  ANSWERED: ["CLOSED", "UNDER_REVIEW", "OPEN"],
  CLOSED: ["OPEN"],
  REJECTED: [],
};

export const RFI_AUDIT_ACTIONS = {
  RFI_CREATED: "RFI_CREATED",
  RFI_UPDATED: "RFI_UPDATED",
  RFI_STATUS_CHANGED: "RFI_STATUS_CHANGED",
  RFI_RESPONSE_ADDED: "RFI_RESPONSE_ADDED",
  RFI_ANSWERED: "RFI_ANSWERED",
  RFI_CLOSED: "RFI_CLOSED",
} as const;

export const RFI_DOMAIN_EVENTS = {
  RFI_CREATED: "RfiCreated",
  RFI_ANSWERED: "RfiAnswered",
  RFI_CLOSED: "RfiClosed",
  RFI_OVERDUE: "RfiOverdue",
} as const;
