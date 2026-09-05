import { NotFoundError, ValidationError } from "../../common/index.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import {
  safetyRepository as defaultRepo,
  type SafetyRepository,
  type SafetyIncidentWithDetails,
} from "./safety.repository.js";
import {
  SAFETY_AUDIT_ACTIONS,
  SAFETY_DOMAIN_EVENTS,
  type ReportSafetyIncidentInput,
  type UpdateSafetyInvestigationInput,
  type AddCorrectiveActionInput,
  type CompleteCorrectiveActionInput,
  type SafetyFilters,
} from "./safety.types.js";

export class SafetyService {
  constructor(
    private readonly repo: SafetyRepository = defaultRepo,
    private readonly audit: AuditService = defaultAuditService,
  ) {}

  /**
   * 6.5.6 — Report a safety incident with automatic OSHA recordability calculation.
   */
  async reportIncident(
    orgId: string,
    userId: string,
    input: ReportSafetyIncidentInput,
  ): Promise<SafetyIncidentWithDetails> {
    if (!input.title?.trim() || !input.description?.trim()) {
      throw new ValidationError("Incident title and description are required");
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

    // Auto-calculate OSHA recordability
    const isRecordableType =
      input.incidentType === "LOST_TIME" ||
      input.incidentType === "MEDICAL_TREATMENT" ||
      input.incidentType === "FATALITY";
    const hasDaysOff = (input.lostWorkDays ?? 0) > 0 || (input.restrictedWorkDays ?? 0) > 0;
    const isOshaRecordable = input.isOshaRecordable || isRecordableType || hasDaysOff;

    let oshaCategory = input.oshaForm300Category;
    if (isOshaRecordable && !oshaCategory) {
      if (input.incidentType === "FATALITY") {
        oshaCategory = "Death";
      } else if ((input.lostWorkDays ?? 0) > 0) {
        oshaCategory = "Days away from work";
      } else if ((input.restrictedWorkDays ?? 0) > 0) {
        oshaCategory = "Job transfer or restriction";
      } else {
        oshaCategory = "Other recordable case";
      }
    }

    const incidentNumber = await this.repo.getNextIncidentNumber(input.projectId);
    const incident = await this.repo.createIncident(orgId, userId, incidentNumber, {
      ...input,
      isOshaRecordable,
      oshaForm300Category: oshaCategory,
    });

    // Audit log
    await this.audit.log({
      orgId,
      userId,
      action: SAFETY_AUDIT_ACTIONS.SAFETY_INCIDENT_REPORTED,
      entity: "safety_incident",
      entityId: incident.id,
      newValue: {
        incidentNumber: incident.incidentNumber,
        title: incident.title,
        incidentType: incident.incidentType,
        severity: incident.severity,
        isOshaRecordable: incident.isOshaRecordable,
        projectId: incident.projectId,
      },
    });

    // Domain event
    await this.audit.log({
      orgId,
      userId,
      action: SAFETY_DOMAIN_EVENTS.SAFETY_INCIDENT_CREATED,
      entity: "domain_event",
      entityId: incident.id,
      newValue: {
        incidentId: incident.id,
        incidentNumber: incident.incidentNumber,
        incidentType: incident.incidentType,
        severity: incident.severity,
        isOshaRecordable: incident.isOshaRecordable,
        projectId: incident.projectId,
      },
    });

    return incident;
  }

  /**
   * 6.5.6 — Record formal investigation findings and root cause.
   */
  async updateInvestigation(
    orgId: string,
    userId: string,
    input: UpdateSafetyInvestigationInput,
  ): Promise<SafetyIncidentWithDetails> {
    if (!input.investigationSummary?.trim()) {
      throw new ValidationError("Investigation summary is required");
    }

    const existing = await this.repo.findIncidentById(orgId, input.incidentId);
    if (!existing) {
      throw new NotFoundError("Safety incident not found");
    }

    const updated = await this.repo.updateInvestigation(orgId, input, userId);

    // Audit log
    await this.audit.log({
      orgId,
      userId,
      action: SAFETY_AUDIT_ACTIONS.SAFETY_INCIDENT_INVESTIGATED,
      entity: "safety_incident",
      entityId: updated.id,
      oldValue: { status: existing.status },
      newValue: {
        status: updated.status,
        investigationSummary: updated.investigationSummary,
        rootCause: updated.rootCause,
      },
    });

    // Domain event
    await this.audit.log({
      orgId,
      userId,
      action: SAFETY_DOMAIN_EVENTS.SAFETY_INCIDENT_INVESTIGATED,
      entity: "domain_event",
      entityId: updated.id,
      newValue: {
        incidentId: updated.id,
        incidentNumber: updated.incidentNumber,
        status: updated.status,
      },
    });

    return updated;
  }

  /**
   * 6.5.6 — Assign a safety corrective action.
   */
  async addCorrectiveAction(
    orgId: string,
    userId: string,
    input: AddCorrectiveActionInput,
  ) {
    if (!input.actionDescription?.trim()) {
      throw new ValidationError("Corrective action description is required");
    }

    const incident = await this.repo.findIncidentById(orgId, input.incidentId);
    if (!incident) {
      throw new NotFoundError("Safety incident not found");
    }

    const action = await this.repo.addCorrectiveAction(orgId, input);

    await this.audit.log({
      orgId,
      userId,
      action: SAFETY_AUDIT_ACTIONS.SAFETY_CORRECTIVE_ACTION_ADDED,
      entity: "safety_corrective_action",
      entityId: action.id,
      newValue: {
        incidentId: input.incidentId,
        actionDescription: action.actionDescription,
        assignedToId: action.assignedToId,
        dueDate: action.dueDate,
      },
    });

    return action;
  }

  /**
   * 6.5.6 — Verify and complete a safety corrective action.
   */
  async completeCorrectiveAction(
    orgId: string,
    userId: string,
    input: CompleteCorrectiveActionInput,
  ) {
    const action = await this.repo.findCorrectiveActionById(orgId, input.correctiveActionId);
    if (!action) {
      throw new NotFoundError("Corrective action not found");
    }

    const completed = await this.repo.completeCorrectiveAction(
      orgId,
      input.correctiveActionId,
      input.verificationNotes,
    );

    await this.audit.log({
      orgId,
      userId,
      action: SAFETY_AUDIT_ACTIONS.SAFETY_CORRECTIVE_ACTION_COMPLETED,
      entity: "safety_corrective_action",
      entityId: completed.id,
      newValue: {
        isCompleted: true,
        completedDate: completed.completedDate,
        verificationNotes: completed.verificationNotes,
      },
    });

    return completed;
  }

  async getIncident(orgId: string, id: string): Promise<SafetyIncidentWithDetails> {
    const incident = await this.repo.findIncidentById(orgId, id);
    if (!incident) {
      throw new NotFoundError("Safety incident not found");
    }
    return incident;
  }

  async listIncidents(
    orgId: string,
    filters?: SafetyFilters,
  ): Promise<{ items: SafetyIncidentWithDetails[]; total: number }> {
    return this.repo.listIncidents(orgId, filters);
  }
}

export const safetyService = new SafetyService();
