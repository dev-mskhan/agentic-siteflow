import type {
  InspectionStatus,
  DeficiencySeverity,
  DeficiencyStatus,
} from "@prisma/client";

export interface ChecklistItem {
  id: string;
  text: string;
  passed: boolean;
  comment?: string;
}

export interface CreateQualityInspectionInput {
  projectId: string;
  title: string;
  description?: string;
  location?: string;
  scheduledDate: Date;
  inspectorId: string;
  linkedTaskId?: string;
  checklistItems?: ChecklistItem[];
  notes?: string;
}

export interface RecordInspectionResultInput {
  inspectionId: string;
  status: InspectionStatus;
  checklistItems?: ChecklistItem[];
  notes?: string;
  completedDate?: Date;
}

export interface CreateDeficiencyInput {
  projectId: string;
  inspectionId?: string;
  title: string;
  description: string;
  location?: string;
  severity?: DeficiencySeverity;
  subcontractorId?: string;
  assignedToId?: string;
  dueDate?: Date;
}

export interface ResolveDeficiencyInput {
  deficiencyId: string;
  correctiveAction: string;
  status?: DeficiencyStatus;
}

export interface QualityFilters {
  projectId?: string;
  status?: InspectionStatus;
  inspectorId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface DeficiencyFilters {
  projectId?: string;
  inspectionId?: string;
  status?: DeficiencyStatus;
  severity?: DeficiencySeverity;
  subcontractorId?: string;
  assignedToId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const QUALITY_AUDIT_ACTIONS = {
  INSPECTION_SCHEDULED: "INSPECTION_SCHEDULED",
  INSPECTION_RECORDED: "INSPECTION_RECORDED",
  DEFICIENCY_CREATED: "DEFICIENCY_CREATED",
  DEFICIENCY_RESOLVED: "DEFICIENCY_RESOLVED",
} as const;

export const QUALITY_DOMAIN_EVENTS = {
  INSPECTION_SCHEDULED: "InspectionScheduled",
  INSPECTION_PASSED: "InspectionPassed",
  INSPECTION_FAILED: "InspectionFailed",
  DEFICIENCY_CREATED: "DeficiencyCreated",
  DEFICIENCY_RESOLVED: "DeficiencyResolved",
} as const;
