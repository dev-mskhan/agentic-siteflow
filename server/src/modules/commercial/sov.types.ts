import type { Prisma, ScheduleOfValues, SovItem, SovType } from "@prisma/client";

export const SOV_AUDIT_ACTIONS = {
  SOV_CREATED: "SOV_CREATED",
  SOV_ACTIVATED: "SOV_ACTIVATED",
  SOV_UPDATED: "SOV_UPDATED",
} as const;

export interface SovItemInput {
  itemNumber: string;
  description: string;
  costCodeId?: string;
  scheduledValue: number;
}

export interface CreateSovInput {
  projectId: string;
  contractId?: string;
  subcontractorId?: string;
  type?: SovType;
  title: string;
  items: SovItemInput[];
}

export interface UpdateSovItemInput {
  itemNumber?: string;
  description?: string;
  costCodeId?: string;
  scheduledValue?: number;
}

export interface SovItemDetail extends SovItem {
  costCode?: {
    id: string;
    code: string;
    name: string;
  } | null;
}

export interface SovDetail extends ScheduleOfValues {
  items: SovItemDetail[];
  contract?: {
    id: string;
    contractNumber: string;
    contractValue: Prisma.Decimal;
  } | null;
  subcontractor?: {
    id: string;
    companyName: string;
  } | null;
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}
