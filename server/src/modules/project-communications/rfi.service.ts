import { NotFoundError, ValidationError } from "../../common/index.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import {
  rfiRepository as defaultRepo,
  type RfiRepository,
  type RfiWithDetails,
} from "./rfi.repository.js";
import {
  RFI_AUDIT_ACTIONS,
  RFI_DOMAIN_EVENTS,
  RFI_STATUS_TRANSITIONS,
  type CreateRfiInput,
  type UpdateRfiInput,
  type RfiFilters,
  type RfiResponseRecord,
} from "./rfi.types.js";

export class RfiService {
  constructor(
    private readonly repo: RfiRepository = defaultRepo,
    private readonly audit: AuditService = defaultAuditService,
  ) {}

  /**
   * 6.2.6 — Create RFI with sequential numbering and domain event.
   */
  async createRfi(
    orgId: string,
    userId: string,
    input: CreateRfiInput,
  ): Promise<RfiWithDetails> {
    if (!input.title?.trim()) {
      throw new ValidationError("RFI title is required");
    }
    if (!input.question?.trim()) {
      throw new ValidationError("RFI question is required");
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

    const rfiNumber = await this.repo.getNextRfiNumber(input.projectId);
    const rfi = await this.repo.create(orgId, userId, rfiNumber, input);

    // Audit log
    await this.audit.log({
      orgId,
      userId,
      action: RFI_AUDIT_ACTIONS.RFI_CREATED,
      entity: "rfi",
      entityId: rfi.id,
      newValue: {
        rfiNumber: rfi.rfiNumber,
        title: rfi.title,
        discipline: rfi.discipline,
        priority: rfi.priority,
        projectId: rfi.projectId,
      },
    });

    // Domain event
    await this.audit.log({
      orgId,
      userId,
      action: RFI_DOMAIN_EVENTS.RFI_CREATED,
      entity: "domain_event",
      entityId: rfi.id,
      newValue: {
        rfiId: rfi.id,
        rfiNumber: rfi.rfiNumber,
        projectId: rfi.projectId,
        title: rfi.title,
        discipline: rfi.discipline,
        priority: rfi.priority,
        dueDate: rfi.dueDate,
      },
    });

    return rfi;
  }

  /**
   * 6.2.6 — Update RFI metadata or details.
   */
  async updateRfi(
    orgId: string,
    id: string,
    userId: string,
    input: UpdateRfiInput,
  ): Promise<RfiWithDetails> {
    const existing = await this.repo.findById(orgId, id);
    if (!existing) {
      throw new NotFoundError("RFI not found");
    }

    if (existing.status === "CLOSED") {
      throw new ValidationError("Cannot modify a closed RFI");
    }

    if (input.linkedTaskId) {
      const task = await this.repo.findTask(orgId, input.linkedTaskId);
      if (!task || task.projectId !== existing.projectId) {
        throw new ValidationError("Linked task must belong to the same project");
      }
    }

    const updated = await this.repo.update(orgId, id, input);

    await this.audit.log({
      orgId,
      userId,
      action: RFI_AUDIT_ACTIONS.RFI_UPDATED,
      entity: "rfi",
      entityId: id,
      oldValue: {
        title: existing.title,
        priority: existing.priority,
        discipline: existing.discipline,
        scheduleImpactDays: existing.scheduleImpactDays,
        costImpactAmount: existing.costImpactAmount,
      },
      newValue: {
        title: updated.title,
        priority: updated.priority,
        discipline: updated.discipline,
        scheduleImpactDays: updated.scheduleImpactDays,
        costImpactAmount: updated.costImpactAmount,
      },
    });

    return updated;
  }

  /**
   * 6.2.6 — Add a discussion response or clarification to an RFI.
   */
  async addResponse(
    orgId: string,
    rfiId: string,
    userId: string,
    responseContent: string,
  ): Promise<RfiResponseRecord> {
    if (!responseContent?.trim()) {
      throw new ValidationError("Response content is required");
    }

    const existing = await this.repo.findById(orgId, rfiId);
    if (!existing) {
      throw new NotFoundError("RFI not found");
    }

    if (existing.status === "CLOSED") {
      throw new ValidationError("Cannot respond to a closed RFI");
    }

    const response = await this.repo.addResponse(orgId, rfiId, userId, responseContent, false);

    await this.audit.log({
      orgId,
      userId,
      action: RFI_AUDIT_ACTIONS.RFI_RESPONSE_ADDED,
      entity: "rfi",
      entityId: rfiId,
      newValue: { responseId: response.id },
    });

    return response;
  }

  /**
   * 6.2.6 — Mark RFI as officially answered.
   */
  async markAnswered(
    orgId: string,
    rfiId: string,
    userId: string,
    answerContent: string,
  ): Promise<RfiWithDetails> {
    if (!answerContent?.trim()) {
      throw new ValidationError("Official answer content is required");
    }

    const existing = await this.repo.findById(orgId, rfiId);
    if (!existing) {
      throw new NotFoundError("RFI not found");
    }

    const allowed = RFI_STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes("ANSWERED")) {
      throw new ValidationError(`Cannot transition RFI from ${existing.status} to ANSWERED`);
    }

    const updated = await this.repo.markAnswered(orgId, rfiId, userId, answerContent);

    // Audit log
    await this.audit.log({
      orgId,
      userId,
      action: RFI_AUDIT_ACTIONS.RFI_ANSWERED,
      entity: "rfi",
      entityId: rfiId,
      oldValue: { status: existing.status },
      newValue: { status: "ANSWERED" },
    });

    // Domain event
    await this.audit.log({
      orgId,
      userId,
      action: RFI_DOMAIN_EVENTS.RFI_ANSWERED,
      entity: "domain_event",
      entityId: rfiId,
      newValue: {
        rfiId,
        rfiNumber: updated.rfiNumber,
        projectId: updated.projectId,
        answeredById: userId,
      },
    });

    return updated;
  }

  /**
   * 6.2.6 — Close an RFI.
   */
  async closeRfi(orgId: string, rfiId: string, userId: string): Promise<RfiWithDetails> {
    const existing = await this.repo.findById(orgId, rfiId);
    if (!existing) {
      throw new NotFoundError("RFI not found");
    }

    const allowed = RFI_STATUS_TRANSITIONS[existing.status];
    if (!allowed.includes("CLOSED")) {
      throw new ValidationError(`Cannot close RFI from ${existing.status} status`);
    }

    const updated = await this.repo.close(orgId, rfiId, userId);

    // Audit log
    await this.audit.log({
      orgId,
      userId,
      action: RFI_AUDIT_ACTIONS.RFI_CLOSED,
      entity: "rfi",
      entityId: rfiId,
      oldValue: { status: existing.status },
      newValue: { status: "CLOSED" },
    });

    // Domain event
    await this.audit.log({
      orgId,
      userId,
      action: RFI_DOMAIN_EVENTS.RFI_CLOSED,
      entity: "domain_event",
      entityId: rfiId,
      newValue: {
        rfiId,
        rfiNumber: updated.rfiNumber,
        projectId: updated.projectId,
        closedById: userId,
      },
    });

    return updated;
  }

  /**
   * 6.2.6 — Get RFI details by ID.
   */
  async getRfi(orgId: string, id: string): Promise<RfiWithDetails> {
    const rfi = await this.repo.findById(orgId, id);
    if (!rfi) {
      throw new NotFoundError("RFI not found");
    }
    return rfi;
  }

  /**
   * 6.2.6 — List RFIs with filtering and pagination.
   */
  async listRfis(
    orgId: string,
    filters?: RfiFilters,
  ): Promise<{ items: RfiWithDetails[]; total: number }> {
    return this.repo.list(orgId, filters);
  }
}

export const rfiService = new RfiService();
