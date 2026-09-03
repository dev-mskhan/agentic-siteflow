import type { PartnerEvaluation, PartnerType } from "@prisma/client";

export type PartnerEvaluationRecord = PartnerEvaluation;

export interface CreatePartnerEvaluationInput {
  partnerType: PartnerType;
  subcontractorId?: string;
  vendorId?: string;
  projectId?: string;
  qualityRating: number;
  timelinessRating: number;
  communicationRating: number;
  safetyRating?: number;
  comments?: string;
}

export interface PartnerRatingsSummary {
  evaluationCount: number;
  averageQuality: number;
  averageTimeliness: number;
  averageCommunication: number;
  averageSafety: number | null;
  averageOverall: number;
}

export interface VendorPerformanceMetrics {
  vendorId: string;
  ratingsSummary: PartnerRatingsSummary;
  totalDeliveries: number;
  deliveredCount: number;
  onTimeDeliveries: number;
  delayedDeliveries: number;
  onTimeDeliveryRate: number;
  averageDelayDays: number;
  totalQuantityReceived: number;
  totalQuantityAccepted: number;
  totalQuantityRejected: number;
  qualityAcceptanceRate: number;
  compositeScore: number;
}

export interface SubcontractorPerformanceMetrics {
  subcontractorId: string;
  ratingsSummary: PartnerRatingsSummary;
  totalAssignedTasks: number;
  completedTasks: number;
  onTimeCompletedTasks: number;
  delayedTasks: number;
  onTimeCompletionRate: number;
  averageTaskDelayDays: number;
  compositeScore: number;
}

export const PARTNER_PERFORMANCE_AUDIT_ACTIONS = {
  PARTNER_EVALUATION_CREATED: "PARTNER_EVALUATION_CREATED",
} as const;
