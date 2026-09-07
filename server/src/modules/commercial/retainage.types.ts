import type { RetainageRelease } from "@prisma/client";

export const RETAINAGE_AUDIT_ACTIONS = {
  RETAINAGE_RELEASE_REQUESTED: "RETAINAGE_RELEASE_REQUESTED",
  RETAINAGE_RELEASE_APPROVED: "RETAINAGE_RELEASE_APPROVED",
  RETAINAGE_RELEASED: "RETAINAGE_RELEASED",
  RETAINAGE_RELEASE_REJECTED: "RETAINAGE_RELEASE_REJECTED",
} as const;

export const RETAINAGE_DOMAIN_EVENTS = {
  RETAINAGE_RELEASED: "RetainageReleased",
} as const;

export interface RequestRetainageReleaseInput {
  projectId: string;
  subcontractorId?: string;
  contractId?: string;
  amountToRelease: number;
  notes?: string;
}

export interface ApproveRetainageReleaseInput {
  id: string;
  lienWaiverVerified?: boolean;
}

export interface RejectRetainageReleaseInput {
  id: string;
  rejectionReason: string;
}

export interface RetainageSummary {
  projectId: string;
  subcontractorId?: string | null;
  contractId?: string | null;
  totalWithheld: number;
  totalReleased: number;
  currentRetainageHeld: number;
}

export interface RetainageReleaseDetail extends RetainageRelease {
  subcontractor?: {
    id: string;
    companyName: string;
  } | null;
  contract?: {
    id: string;
    contractNumber: string;
  } | null;
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
}
