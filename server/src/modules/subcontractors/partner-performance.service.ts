import { NotFoundError, ValidationError } from "../../common/index.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import {
  partnerPerformanceRepository as defaultRepo,
  type PartnerPerformanceRepository,
} from "./partner-performance.repository.js";
import {
  PARTNER_PERFORMANCE_AUDIT_ACTIONS,
  type CreatePartnerEvaluationInput,
  type PartnerEvaluationRecord,
  type PartnerRatingsSummary,
  type SubcontractorPerformanceMetrics,
  type VendorPerformanceMetrics,
} from "./partner-performance.types.js";

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

function validateRating(name: string, val: number, required = true): void {
  if (val === undefined || val === null) {
    if (required) {
      throw new ValidationError(`${name} is required`);
    }
    return;
  }
  if (!Number.isInteger(val) || val < 1 || val > 5) {
    throw new ValidationError(`${name} must be an integer between 1 and 5`);
  }
}

export class PartnerPerformanceService {
  constructor(
    private readonly repo: PartnerPerformanceRepository = defaultRepo,
    private readonly audit: AuditService = defaultAuditService,
  ) {}

  /**
   * 5.9.6 — Submit a partner performance evaluation and update aggregate rating.
   */
  async evaluatePartner(
    orgId: string,
    userId: string,
    input: CreatePartnerEvaluationInput,
  ): Promise<PartnerEvaluationRecord> {
    validateRating("Quality rating", input.qualityRating);
    validateRating("Timeliness rating", input.timelinessRating);
    validateRating("Communication rating", input.communicationRating);
    if (input.safetyRating !== undefined && input.safetyRating !== null) {
      validateRating("Safety rating", input.safetyRating, false);
    }

    const partnerId =
      input.partnerType === "SUBCONTRACTOR"
        ? input.subcontractorId
        : input.vendorId;

    if (!partnerId) {
      throw new ValidationError(
        input.partnerType === "SUBCONTRACTOR"
          ? "subcontractorId is required for subcontractor evaluation"
          : "vendorId is required for vendor evaluation",
      );
    }

    // Verify partner exists
    if (input.partnerType === "SUBCONTRACTOR") {
      const sub = await this.repo.findSubcontractor(orgId, partnerId);
      if (!sub) {
        throw new NotFoundError("Subcontractor not found");
      }
    } else {
      const vendor = await this.repo.findVendor(orgId, partnerId);
      if (!vendor) {
        throw new NotFoundError("Vendor not found");
      }
    }

    // Verify project if provided
    if (input.projectId) {
      const proj = await this.repo.findProject(orgId, input.projectId);
      if (!proj) {
        throw new NotFoundError("Project not found");
      }
    }

    // Calculate overall rating
    let overallRating: number;
    if (input.safetyRating !== undefined && input.safetyRating !== null) {
      overallRating = round2(
        (input.qualityRating +
          input.timelinessRating +
          input.communicationRating +
          input.safetyRating) /
          4,
      );
    } else {
      overallRating = round2(
        (input.qualityRating +
          input.timelinessRating +
          input.communicationRating) /
          3,
      );
    }

    // Create evaluation
    const evaluation = await this.repo.createEvaluation({
      orgId,
      partnerType: input.partnerType,
      subcontractorId: input.subcontractorId ?? null,
      vendorId: input.vendorId ?? null,
      projectId: input.projectId ?? null,
      qualityRating: input.qualityRating,
      timelinessRating: input.timelinessRating,
      communicationRating: input.communicationRating,
      safetyRating: input.safetyRating ?? null,
      overallRating,
      comments: input.comments ?? null,
      evaluatorId: userId,
    });

    // Update aggregate rating on partner
    const allEvals = await this.repo.findByPartner(
      orgId,
      input.partnerType,
      partnerId,
    );
    const sumOverall = allEvals.reduce(
      (sum, e) => sum + Number(e.overallRating),
      0,
    );
    const avgRating = round2(sumOverall / allEvals.length);
    await this.repo.updatePartnerRating(
      orgId,
      input.partnerType,
      partnerId,
      avgRating,
    );

    // Audit log
    await this.audit.log({
      orgId,
      userId,
      action: PARTNER_PERFORMANCE_AUDIT_ACTIONS.PARTNER_EVALUATION_CREATED,
      entity: "partner_evaluation",
      entityId: evaluation.id,
      newValue: {
        partnerType: input.partnerType,
        partnerId,
        overallRating,
        aggregateRating: avgRating,
      },
    });

    return evaluation;
  }

  /**
   * Compute ratings summary from evaluations list.
   */
  private computeRatingsSummary(
    evaluations: PartnerEvaluationRecord[],
  ): PartnerRatingsSummary {
    if (evaluations.length === 0) {
      return {
        evaluationCount: 0,
        averageQuality: 0,
        averageTimeliness: 0,
        averageCommunication: 0,
        averageSafety: null,
        averageOverall: 0,
      };
    }

    const count = evaluations.length;
    let sumQ = 0;
    let sumT = 0;
    let sumC = 0;
    let sumS = 0;
    let countS = 0;
    let sumO = 0;

    for (const e of evaluations) {
      sumQ += e.qualityRating;
      sumT += e.timelinessRating;
      sumC += e.communicationRating;
      if (e.safetyRating !== null && e.safetyRating !== undefined) {
        sumS += e.safetyRating;
        countS += 1;
      }
      sumO += Number(e.overallRating);
    }

    return {
      evaluationCount: count,
      averageQuality: round2(sumQ / count),
      averageTimeliness: round2(sumT / count),
      averageCommunication: round2(sumC / count),
      averageSafety: countS > 0 ? round2(sumS / countS) : null,
      averageOverall: round2(sumO / count),
    };
  }

  /**
   * 5.9.6 — Get vendor performance metrics (subjective ratings + objective delivery stats).
   */
  async getVendorPerformanceMetrics(
    orgId: string,
    vendorId: string,
  ): Promise<VendorPerformanceMetrics> {
    const vendor = await this.repo.findVendor(orgId, vendorId);
    if (!vendor) {
      throw new NotFoundError("Vendor not found");
    }

    const [evaluations, deliveries] = await Promise.all([
      this.repo.findByPartner(orgId, "VENDOR", vendorId),
      this.repo.getVendorDeliveries(orgId, vendorId),
    ]);

    const ratingsSummary = this.computeRatingsSummary(evaluations);

    const totalDeliveries = deliveries.length;
    const deliveredDeliveries = deliveries.filter(
      (d) => d.status === "DELIVERED" || d.status === "PARTIALLY_RECEIVED",
    );
    const deliveredCount = deliveredDeliveries.length;

    let onTimeDeliveries = 0;
    let delayedDeliveries = 0;
    let totalDelayDays = 0;

    for (const d of deliveries) {
      if (d.isDelayed || d.delayedDays > 0) {
        delayedDeliveries += 1;
        totalDelayDays += d.delayedDays;
      } else if (d.status === "DELIVERED" || d.status === "PARTIALLY_RECEIVED") {
        onTimeDeliveries += 1;
      }
    }

    const onTimeDeliveryRate =
      deliveredCount > 0 ? round2((onTimeDeliveries / deliveredCount) * 100) : 100;

    const averageDelayDays =
      delayedDeliveries > 0 ? round2(totalDelayDays / delayedDeliveries) : 0;

    let totalQuantityReceived = 0;
    let totalQuantityAccepted = 0;
    let totalQuantityRejected = 0;

    for (const d of deliveries) {
      for (const item of d.receiptItems) {
        totalQuantityReceived += Number(item.quantityReceived);
        totalQuantityAccepted += Number(item.quantityAccepted);
        totalQuantityRejected += Number(item.quantityRejected);
      }
    }

    const qualityAcceptanceRate =
      totalQuantityReceived > 0
        ? round2((totalQuantityAccepted / totalQuantityReceived) * 100)
        : 100;

    // Composite score on 1-5 scale:
    // 40% subjective rating (or default 5 if no evaluations), 30% on-time rate, 30% quality acceptance rate
    const subjectivePart =
      ratingsSummary.evaluationCount > 0 ? ratingsSummary.averageOverall : 5;
    const onTimePart = (onTimeDeliveryRate / 100) * 5;
    const qualityPart = (qualityAcceptanceRate / 100) * 5;
    const compositeScore = round2(
      subjectivePart * 0.4 + onTimePart * 0.3 + qualityPart * 0.3,
    );

    return {
      vendorId,
      ratingsSummary,
      totalDeliveries,
      deliveredCount,
      onTimeDeliveries,
      delayedDeliveries,
      onTimeDeliveryRate,
      averageDelayDays,
      totalQuantityReceived: round2(totalQuantityReceived),
      totalQuantityAccepted: round2(totalQuantityAccepted),
      totalQuantityRejected: round2(totalQuantityRejected),
      qualityAcceptanceRate,
      compositeScore,
    };
  }

  /**
   * 5.9.6 — Get subcontractor performance metrics (subjective ratings + task completion stats).
   */
  async getSubcontractorPerformanceMetrics(
    orgId: string,
    subcontractorId: string,
  ): Promise<SubcontractorPerformanceMetrics> {
    const subcontractor = await this.repo.findSubcontractor(
      orgId,
      subcontractorId,
    );
    if (!subcontractor) {
      throw new NotFoundError("Subcontractor not found");
    }

    const [evaluations, tasks] = await Promise.all([
      this.repo.findByPartner(orgId, "SUBCONTRACTOR", subcontractorId),
      this.repo.getSubcontractorTasks(orgId, subcontractorId),
    ]);

    const ratingsSummary = this.computeRatingsSummary(evaluations);

    const totalAssignedTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === "DONE").length;

    let onTimeCompletedTasks = 0;
    let delayedTasks = 0;
    let totalDelayDays = 0;
    const now = new Date();

    for (const t of tasks) {
      let isTaskDelayed = false;
      let delayDays = 0;

      if (t.status === "DONE") {
        if (t.plannedEndDate && t.actualEndDate && t.actualEndDate > t.plannedEndDate) {
          isTaskDelayed = true;
          delayDays = Math.ceil(
            (t.actualEndDate.getTime() - t.plannedEndDate.getTime()) / (1000 * 60 * 60 * 24),
          );
        }
        if (!isTaskDelayed) {
          onTimeCompletedTasks += 1;
        }
      } else if (t.status !== "CANCELLED") {
        if (t.plannedEndDate && now > t.plannedEndDate) {
          isTaskDelayed = true;
          delayDays = Math.ceil(
            (now.getTime() - t.plannedEndDate.getTime()) / (1000 * 60 * 60 * 24),
          );
        }
      }

      if (isTaskDelayed) {
        delayedTasks += 1;
        totalDelayDays += delayDays;
      }
    }

    const onTimeCompletionRate =
      completedTasks > 0
        ? round2((onTimeCompletedTasks / completedTasks) * 100)
        : 100;

    const averageTaskDelayDays =
      delayedTasks > 0 ? round2(totalDelayDays / delayedTasks) : 0;

    // Composite score on 1-5 scale: 50% subjective rating, 50% on-time completion rate
    const subjectivePart =
      ratingsSummary.evaluationCount > 0 ? ratingsSummary.averageOverall : 5;
    const taskPart = (onTimeCompletionRate / 100) * 5;
    const compositeScore = round2(subjectivePart * 0.5 + taskPart * 0.5);

    return {
      subcontractorId,
      ratingsSummary,
      totalAssignedTasks,
      completedTasks,
      onTimeCompletedTasks,
      delayedTasks,
      onTimeCompletionRate,
      averageTaskDelayDays,
      compositeScore,
    };
  }
}

export const partnerPerformanceService = new PartnerPerformanceService();
