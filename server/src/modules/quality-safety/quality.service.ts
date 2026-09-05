import { NotFoundError, ValidationError } from "../../common/index.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import {
  qualityRepository as defaultRepo,
  type QualityRepository,
  type QualityInspectionWithDetails,
  type DeficiencyWithDetails,
} from "./quality.repository.js";
import {
  QUALITY_AUDIT_ACTIONS,
  QUALITY_DOMAIN_EVENTS,
  type CreateQualityInspectionInput,
  type RecordInspectionResultInput,
  type CreateDeficiencyInput,
  type ResolveDeficiencyInput,
  type QualityFilters,
  type DeficiencyFilters,
} from "./quality.types.js";

export class QualityService {
  constructor(
    private readonly repo: QualityRepository = defaultRepo,
    private readonly audit: AuditService = defaultAuditService,
  ) {}

  /**
   * 6.4.6 — Schedule a quality inspection.
   */
  async scheduleInspection(
    orgId: string,
    userId: string,
    input: CreateQualityInspectionInput,
  ): Promise<QualityInspectionWithDetails> {
    if (!input.title?.trim()) {
      throw new ValidationError("Inspection title is required");
    }

    const project = await this.repo.findProject(orgId, input.projectId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }

    if (input.linkedTaskId) {
      const task = await this.repo.findTask(orgId, input.linkedTaskId);
      if (!task || task.projectId !== input.projectId) {
        throw new ValidationError("Linked task must belong to the same project");
      }
    }

    const inspectionNumber = await this.repo.getNextInspectionNumber(input.projectId);
    const inspection = await this.repo.createInspection(orgId, inspectionNumber, input);

    // Audit log
    await this.audit.log({
      orgId,
      userId,
      action: QUALITY_AUDIT_ACTIONS.INSPECTION_SCHEDULED,
      entity: "quality_inspection",
      entityId: inspection.id,
      newValue: {
        inspectionNumber: inspection.inspectionNumber,
        title: inspection.title,
        scheduledDate: inspection.scheduledDate,
        projectId: inspection.projectId,
      },
    });

    // Domain event
    await this.audit.log({
      orgId,
      userId,
      action: QUALITY_DOMAIN_EVENTS.INSPECTION_SCHEDULED,
      entity: "domain_event",
      entityId: inspection.id,
      newValue: {
        inspectionId: inspection.id,
        inspectionNumber: inspection.inspectionNumber,
        projectId: inspection.projectId,
        title: inspection.title,
      },
    });

    return inspection;
  }

  /**
   * 6.4.6 — Record inspection results and checklist evaluations.
   */
  async recordInspectionResults(
    orgId: string,
    userId: string,
    input: RecordInspectionResultInput,
  ): Promise<QualityInspectionWithDetails> {
    const existing = await this.repo.findInspectionById(orgId, input.inspectionId);
    if (!existing) {
      throw new NotFoundError("Quality inspection not found");
    }

    // Auto-calculate failure if checklist contains failed items and status wasn't explicitly failed/passed
    let finalStatus = input.status;
    if (input.checklistItems && input.checklistItems.length > 0) {
      const hasFailures = input.checklistItems.some((item) => !item.passed);
      if (hasFailures && input.status === "PASSED") {
        finalStatus = "PASSED_WITH_CONDITIONS";
      }
    }

    const updated = await this.repo.recordInspectionResults(orgId, {
      ...input,
      status: finalStatus,
    });

    // Audit log
    await this.audit.log({
      orgId,
      userId,
      action: QUALITY_AUDIT_ACTIONS.INSPECTION_RECORDED,
      entity: "quality_inspection",
      entityId: updated.id,
      oldValue: { status: existing.status },
      newValue: { status: updated.status, completedDate: updated.completedDate },
    });

    // Domain event
    if (finalStatus === "PASSED" || finalStatus === "PASSED_WITH_CONDITIONS") {
      await this.audit.log({
        orgId,
        userId,
        action: QUALITY_DOMAIN_EVENTS.INSPECTION_PASSED,
        entity: "domain_event",
        entityId: updated.id,
        newValue: {
          inspectionId: updated.id,
          inspectionNumber: updated.inspectionNumber,
          status: updated.status,
        },
      });
    } else if (finalStatus === "FAILED") {
      await this.audit.log({
        orgId,
        userId,
        action: QUALITY_DOMAIN_EVENTS.INSPECTION_FAILED,
        entity: "domain_event",
        entityId: updated.id,
        newValue: {
          inspectionId: updated.id,
          inspectionNumber: updated.inspectionNumber,
          status: updated.status,
        },
      });
    }

    return updated;
  }

  /**
   * 6.4.6 — Create a deficiency item.
   */
  async createDeficiency(
    orgId: string,
    userId: string,
    input: CreateDeficiencyInput,
  ): Promise<DeficiencyWithDetails> {
    if (!input.title?.trim() || !input.description?.trim()) {
      throw new ValidationError("Deficiency title and description are required");
    }

    const project = await this.repo.findProject(orgId, input.projectId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }

    if (input.subcontractorId) {
      const sub = await this.repo.findSubcontractor(orgId, input.subcontractorId);
      if (!sub) {
        throw new NotFoundError("Subcontractor not found");
      }
    }

    if (input.inspectionId) {
      const insp = await this.repo.findInspectionById(orgId, input.inspectionId);
      if (!insp) {
        throw new NotFoundError("Associated quality inspection not found");
      }
    }

    const deficiencyNumber = await this.repo.getNextDeficiencyNumber(input.projectId);
    const deficiency = await this.repo.createDeficiency(orgId, userId, deficiencyNumber, input);

    // Audit log
    await this.audit.log({
      orgId,
      userId,
      action: QUALITY_AUDIT_ACTIONS.DEFICIENCY_CREATED,
      entity: "deficiency",
      entityId: deficiency.id,
      newValue: {
        deficiencyNumber: deficiency.deficiencyNumber,
        title: deficiency.title,
        severity: deficiency.severity,
        projectId: deficiency.projectId,
      },
    });

    // Domain event
    await this.audit.log({
      orgId,
      userId,
      action: QUALITY_DOMAIN_EVENTS.DEFICIENCY_CREATED,
      entity: "domain_event",
      entityId: deficiency.id,
      newValue: {
        deficiencyId: deficiency.id,
        deficiencyNumber: deficiency.deficiencyNumber,
        severity: deficiency.severity,
        projectId: deficiency.projectId,
      },
    });

    return deficiency;
  }

  /**
   * 6.4.6 — Resolve a deficiency with corrective action.
   */
  async resolveDeficiency(
    orgId: string,
    userId: string,
    input: ResolveDeficiencyInput,
  ): Promise<DeficiencyWithDetails> {
    if (!input.correctiveAction?.trim()) {
      throw new ValidationError("Corrective action description is required");
    }

    const existing = await this.repo.findDeficiencyById(orgId, input.deficiencyId);
    if (!existing) {
      throw new NotFoundError("Deficiency not found");
    }

    const resolved = await this.repo.resolveDeficiency(
      orgId,
      input.deficiencyId,
      userId,
      input.correctiveAction,
      input.status ?? "RESOLVED",
    );

    // Audit log
    await this.audit.log({
      orgId,
      userId,
      action: QUALITY_AUDIT_ACTIONS.DEFICIENCY_RESOLVED,
      entity: "deficiency",
      entityId: resolved.id,
      oldValue: { status: existing.status },
      newValue: {
        status: resolved.status,
        correctiveAction: resolved.correctiveAction,
        resolvedAt: resolved.resolvedAt,
      },
    });

    // Domain event
    await this.audit.log({
      orgId,
      userId,
      action: QUALITY_DOMAIN_EVENTS.DEFICIENCY_RESOLVED,
      entity: "domain_event",
      entityId: resolved.id,
      newValue: {
        deficiencyId: resolved.id,
        deficiencyNumber: resolved.deficiencyNumber,
        status: resolved.status,
      },
    });

    return resolved;
  }

  async getInspection(orgId: string, id: string): Promise<QualityInspectionWithDetails> {
    const inspection = await this.repo.findInspectionById(orgId, id);
    if (!inspection) {
      throw new NotFoundError("Quality inspection not found");
    }
    return inspection;
  }

  async listInspections(
    orgId: string,
    filters?: QualityFilters,
  ): Promise<{ items: QualityInspectionWithDetails[]; total: number }> {
    return this.repo.listInspections(orgId, filters);
  }

  async getDeficiency(orgId: string, id: string): Promise<DeficiencyWithDetails> {
    const deficiency = await this.repo.findDeficiencyById(orgId, id);
    if (!deficiency) {
      throw new NotFoundError("Deficiency not found");
    }
    return deficiency;
  }

  async listDeficiencies(
    orgId: string,
    filters?: DeficiencyFilters,
  ): Promise<{ items: DeficiencyWithDetails[]; total: number }> {
    return this.repo.listDeficiencies(orgId, filters);
  }
}

export const qualityService = new QualityService();
