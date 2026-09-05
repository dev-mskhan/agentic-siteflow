import type { Submittal, SubmittalReview, SubmittalStatus, SubmittalType } from "@prisma/client";

export type SubmittalRecord = Submittal;
export type SubmittalReviewRecord = SubmittalReview;

export interface CreateSubmittalInput {
  projectId: string;
  title: string;
  description?: string;
  specSection?: string;
  type?: SubmittalType;
  subcontractorId?: string;
  leadReviewerId?: string;
  dueDate?: Date;
  requiredOnSiteDate?: Date;
  linkedTaskId?: string;
}

export interface CreateSubmittalRevisionInput {
  submittalId: string;
  title?: string;
  description?: string;
  specSection?: string;
  type?: SubmittalType;
  subcontractorId?: string;
  leadReviewerId?: string;
  dueDate?: Date;
  requiredOnSiteDate?: Date;
  linkedTaskId?: string;
}

export interface SubmitSubmittalReviewInput {
  submittalId: string;
  status: SubmittalStatus; // APPROVED, APPROVED_AS_NOTED, REVISE_AND_RESUBMIT, REJECTED
  comments?: string;
}

export interface SubmittalFilters {
  projectId?: string;
  status?: SubmittalStatus;
  type?: SubmittalType;
  subcontractorId?: string;
  leadReviewerId?: string;
  submittedById?: string;
  specSection?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const SUBMITTAL_REVIEW_STATUSES: SubmittalStatus[] = [
  "APPROVED",
  "APPROVED_AS_NOTED",
  "REVISE_AND_RESUBMIT",
  "REJECTED",
];

export const SUBMITTAL_AUDIT_ACTIONS = {
  SUBMITTAL_CREATED: "SUBMITTAL_CREATED",
  SUBMITTAL_REVISED: "SUBMITTAL_REVISED",
  SUBMITTAL_STATUS_CHANGED: "SUBMITTAL_STATUS_CHANGED",
  SUBMITTAL_REVIEWED: "SUBMITTAL_REVIEWED",
} as const;

export const SUBMITTAL_DOMAIN_EVENTS = {
  SUBMITTAL_SUBMITTED: "SubmittalSubmitted",
  SUBMITTAL_APPROVED: "SubmittalApproved",
  SUBMITTAL_REJECTED: "SubmittalRejected",
} as const;
