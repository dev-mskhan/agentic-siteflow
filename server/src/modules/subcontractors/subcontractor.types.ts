import type {
  Subcontractor,
  SubcontractorContract,
  SubcontractorContractStatus,
  SubcontractorStatus,
} from "@prisma/client";

export type SubcontractorRecord = Subcontractor;
export type SubcontractorContractRecord = SubcontractorContract;

export interface CreateSubcontractorInput {
  companyName: string;
  trade: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  taxId?: string;
  licenseNumber?: string;
  licenseExpiry?: Date;
  insurancePolicyNumber?: string;
  insuranceExpiry?: Date;
  notes?: string;
}

export interface UpdateSubcontractorInput {
  companyName?: string;
  trade?: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  taxId?: string | null;
  status?: SubcontractorStatus;
  licenseNumber?: string | null;
  licenseExpiry?: Date | null;
  insurancePolicyNumber?: string | null;
  insuranceExpiry?: Date | null;
  isCompliant?: boolean;
  notes?: string | null;
}

export interface SubcontractorFilters {
  trade?: string;
  status?: SubcontractorStatus;
  isCompliant?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CreateSubcontractorContractInput {
  projectId: string;
  subcontractorId: string;
  scopeOfWork: string;
  contractValue: number;
  retainagePercent?: number;
  startDate?: Date;
  endDate?: Date;
  costCodeId?: string;
}

export interface UpdateSubcontractorContractInput {
  scopeOfWork?: string;
  contractValue?: number;
  retainagePercent?: number;
  startDate?: Date | null;
  endDate?: Date | null;
  costCodeId?: string | null;
}

export const SUBCONTRACTOR_AUDIT_ACTIONS = {
  SUBCONTRACTOR_CREATED: "SUBCONTRACTOR_CREATED",
  SUBCONTRACTOR_UPDATED: "SUBCONTRACTOR_UPDATED",
  SUBCONTRACTOR_STATUS_CHANGED: "SUBCONTRACTOR_STATUS_CHANGED",
  SUBCONTRACTOR_CONTRACT_CREATED: "SUBCONTRACTOR_CONTRACT_CREATED",
  SUBCONTRACTOR_CONTRACT_UPDATED: "SUBCONTRACTOR_CONTRACT_UPDATED",
  SUBCONTRACTOR_CONTRACT_STATUS_CHANGED: "SUBCONTRACTOR_CONTRACT_STATUS_CHANGED",
  SUBCONTRACTOR_ASSIGNED_TASK: "SUBCONTRACTOR_ASSIGNED_TASK",
  PARTNER_EVALUATION_CREATED: "PARTNER_EVALUATION_CREATED",
} as const;

export const SUBCONTRACTOR_DOMAIN_EVENTS = {
  SUBCONTRACTOR_ASSIGNED: "SubcontractorAssigned",
} as const;

export const SUBCONTRACTOR_CONTRACT_STATUS_TRANSITIONS: Record<
  SubcontractorContractStatus,
  SubcontractorContractStatus[]
> = {
  DRAFT: ["ACTIVE", "TERMINATED"],
  ACTIVE: ["COMPLETED", "TERMINATED"],
  COMPLETED: [],
  TERMINATED: [],
};
