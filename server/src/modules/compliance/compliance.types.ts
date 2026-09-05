import type { ComplianceType, ComplianceStatus } from "@prisma/client";

export interface CreateComplianceRecordInput {
  projectId?: string;
  subcontractorId?: string;
  complianceType: ComplianceType;
  title: string;
  referenceNumber?: string;
  issuingAuthority?: string;
  status?: ComplianceStatus;
  issueDate?: Date;
  expirationDate?: Date;
  reminderDays?: number;
  responsibleUserId?: string;
  notes?: string;
}

export interface UpdateComplianceRecordInput {
  status?: ComplianceStatus;
  title?: string;
  referenceNumber?: string;
  issuingAuthority?: string;
  issueDate?: Date | null;
  expirationDate?: Date | null;
  reminderDays?: number;
  responsibleUserId?: string | null;
  notes?: string | null;
}

export interface ComplianceFilters {
  projectId?: string;
  subcontractorId?: string;
  complianceType?: ComplianceType;
  status?: ComplianceStatus;
  expiringWithinDays?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

export const COMPLIANCE_AUDIT_ACTIONS = {
  COMPLIANCE_RECORD_CREATED: "COMPLIANCE_RECORD_CREATED",
  COMPLIANCE_RECORD_UPDATED: "COMPLIANCE_RECORD_UPDATED",
  COMPLIANCE_RECORD_EXPIRED: "COMPLIANCE_RECORD_EXPIRED",
} as const;

export const COMPLIANCE_DOMAIN_EVENTS = {
  COMPLIANCE_RECORD_EXPIRING: "ComplianceRecordExpiring",
} as const;
