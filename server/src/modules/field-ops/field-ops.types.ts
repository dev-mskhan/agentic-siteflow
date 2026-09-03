import type { IssuePriority, IssueStatus } from "@prisma/client";

export const FIELD_OPS_AUDIT_ACTIONS = {
  DAILY_LOG_CREATED: "DAILY_LOG_CREATED",
  DAILY_LOG_UPDATED: "DAILY_LOG_UPDATED",
  ISSUE_CREATED: "ISSUE_CREATED",
  ISSUE_UPDATED: "ISSUE_UPDATED",
  ISSUE_RESOLVED: "ISSUE_RESOLVED",
} as const;

export const FIELD_OPS_DOMAIN_EVENTS = {
  ISSUE_CREATED: "IssueCreated",
  ISSUE_RESOLVED: "IssueResolved",
} as const;

export interface QuantityCompleted {
  description: string;
  quantity: number;
  unit: string;
}

export interface Delivery {
  item: string;
  supplier?: string;
  quantity: number;
}

export interface Delay {
  description: string;
  hoursLost: number;
  reason?: string;
}

export interface SafetyEvent {
  description: string;
  severity: string;
}

export interface DailyLogInput {
  logDate: Date;
  weather?: string;
  temperature?: number;
  siteConditions?: string;
  workerCount?: number;
  subcontractorCount?: number;
  equipmentNotes?: string;
  workPerformed: string;
  quantitiesCompleted?: QuantityCompleted[];
  deliveries?: Delivery[];
  delays?: Delay[];
  safetyEvents?: SafetyEvent[];
  notes?: string;
}

export interface DailyLogFilters {
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface IssueFilters {
  status?: IssueStatus;
  priority?: IssuePriority;
  category?: string;
  limit?: number;
  offset?: number;
}
