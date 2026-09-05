import type {
  SafetyIncidentType,
  SafetyIncidentSeverity,
  SafetyIncidentStatus,
} from "@prisma/client";

export interface ReportSafetyIncidentInput {
  projectId: string;
  incidentDate: Date;
  incidentType: SafetyIncidentType;
  severity?: SafetyIncidentSeverity;
  title: string;
  description: string;
  location?: string;
  isOshaRecordable?: boolean;
  oshaForm300Category?: string;
  lostWorkDays?: number;
  restrictedWorkDays?: number;
  affectedPersonName?: string;
  affectedPersonType?: string;
  subcontractorId?: string;
}

export interface UpdateSafetyInvestigationInput {
  incidentId: string;
  status?: SafetyIncidentStatus;
  investigationSummary: string;
  rootCause?: string;
  investigatedById?: string;
  closeIncident?: boolean;
}

export interface AddCorrectiveActionInput {
  incidentId: string;
  actionDescription: string;
  assignedToId: string;
  dueDate: Date;
}

export interface CompleteCorrectiveActionInput {
  correctiveActionId: string;
  verificationNotes?: string;
}

export interface SafetyFilters {
  projectId?: string;
  incidentType?: SafetyIncidentType;
  severity?: SafetyIncidentSeverity;
  status?: SafetyIncidentStatus;
  isOshaRecordable?: boolean;
  subcontractorId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const SAFETY_AUDIT_ACTIONS = {
  SAFETY_INCIDENT_REPORTED: "SAFETY_INCIDENT_REPORTED",
  SAFETY_INCIDENT_INVESTIGATED: "SAFETY_INCIDENT_INVESTIGATED",
  SAFETY_CORRECTIVE_ACTION_ADDED: "SAFETY_CORRECTIVE_ACTION_ADDED",
  SAFETY_CORRECTIVE_ACTION_COMPLETED: "SAFETY_CORRECTIVE_ACTION_COMPLETED",
} as const;

export const SAFETY_DOMAIN_EVENTS = {
  SAFETY_INCIDENT_CREATED: "SafetyIncidentCreated",
  SAFETY_INCIDENT_INVESTIGATED: "SafetyIncidentInvestigated",
} as const;
