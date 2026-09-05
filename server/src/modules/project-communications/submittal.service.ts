import { NotFoundError, ValidationError } from "../../common/index.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import {
  submittalRepository as defaultRepo,
  type SubmittalRepository,
  type SubmittalWithDetails,
} from "./submittal.repository.js";
import {
  SUBMITTAL_AUDIT_ACTIONS,
  SUBMITTAL_DOMAIN_EVENTS,
  SUBMITTAL_REVIEW_STATUSES,
  type CreateSubmittalInput,
  type CreateSubmittalRevisionInput,
  type SubmitSubmittalReviewInput,
  type SubmittalFilters,
} from "./submittal.types.js";

export class SubmittalService {
  constructor(
    private readonly repo: SubmittalRepository = defaultRepo,
    private readonly audit: AuditService = defaultAuditService,
  ) {}

  /**
   * 6.3.6 — Create a new submittal package.
   */
  async createSubmittal(
    orgId: string,
    userId: string,
    input: CreateSubmittalInput,
  ): Promise<SubmittalWithDetails> {
    if (!input.title?.trim()) {
      throw new ValidationError("Submittal title is required");
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

    if (input.linkedTaskId) {
      const task = await this.repo.findTask(orgId, input.linkedTaskId);
      if (!task || task.projectId !== input.projectId) {
        throw new ValidationError("Linked task must belong to the same project");
      }
    }

    const submittalNumber = await this.repo.getNextSubmittalNumber(input.projectId);
    const submittal = await this.repo.create(orgId, userId, submittalNumber, input);

    // Audit log
    await this.audit.log({
      orgId,
      userId,
      action: SUBMITTAL_AUDIT_ACTIONS.SUBMITTAL_CREATED,
      entity: "submittal",
      entityId: submittal.id,
      newValue: {
        submittalNumber: submittal.submittalNumber,
        revision: submittal.revision,
        title: submittal.title,
        specSection: submittal.specSection,
        projectId: submittal.projectId,
      },
    });

    // Domain event
    await this.audit.log({
      orgId,
      userId,
      action: SUBMITTAL_DOMAIN_EVENTS.SUBMITTAL_SUBMITTED,
      entity: "domain_event",
      entityId: submittal.id,
      newValue: {
        submittalId: submittal.id,
        submittalNumber: submittal.submittalNumber,
        revision: submittal.revision,
        projectId: submittal.projectId,
        title: submittal.title,
        specSection: submittal.specSection,
      },
    });

    return submittal;
  }

  /**
   * 6.3.6 — Create a revised submittal (e.g. Rev 1, Rev 2 after REVISE_AND_RESUBMIT).
   */
  async createRevision(
    orgId: string,
    userId: string,
    input: CreateSubmittalRevisionInput,
  ): Promise<SubmittalWithDetails> {
    const existing = await this.repo.findById(orgId, input.submittalId);
    if (!existing) {
      throw new NotFoundError("Submittal not found");
    }

    const revised = await this.repo.createRevision(orgId, userId, existing, input);

    await this.audit.log({
      orgId,
      userId,
      action: SUBMITTAL_AUDIT_ACTIONS.SUBMITTAL_REVISED,
      entity: "submittal",
      entityId: revised.id,
      newValue: {
        submittalNumber: revised.submittalNumber,
        previousRevision: existing.revision,
        newRevision: revised.revision,
      },
    });

    await this.audit.log({
      orgId,
      userId,
      action: SUBMITTAL_DOMAIN_EVENTS.SUBMITTAL_SUBMITTED,
      entity: "domain_event",
      entityId: revised.id,
      newValue: {
        submittalId: revised.id,
        submittalNumber: revised.submittalNumber,
        revision: revised.revision,
        projectId: revised.projectId,
        title: revised.title,
      },
    });

    return revised;
  }

  /**
   * 6.3.6 — Submit a formal review/approval decision on a submittal.
   */
  async submitReview(
    orgId: string,
    userId: string,
    input: SubmitSubmittalReviewInput,
  ): Promise<SubmittalWithDetails> {
    if (!SUBMITTAL_REVIEW_STATUSES.includes(input.status)) {
      throw new ValidationError(`Invalid review status: ${input.status}`);
    }

    const existing = await this.repo.findById(orgId, input.submittalId);
    if (!existing) {
      throw new NotFoundError("Submittal not found");
    }

    const updated = await this.repo.addReview(
      orgId,
      input.submittalId,
      userId,
      input.status,
      input.comments,
    );

    // Audit log
    await this.audit.log({
      orgId,
      userId,
      action: SUBMITTAL_AUDIT_ACTIONS.SUBMITTAL_REVIEWED,
      entity: "submittal",
      entityId: input.submittalId,
      oldValue: { status: existing.status },
      newValue: { status: input.status, comments: input.comments },
    });

    // Domain event
    if (input.status === "APPROVED" || input.status === "APPROVED_AS_NOTED") {
      await this.audit.log({
        orgId,
        userId,
        action: SUBMITTAL_DOMAIN_EVENTS.SUBMITTAL_APPROVED,
        entity: "domain_event",
        entityId: input.submittalId,
        newValue: {
          submittalId: input.submittalId,
          submittalNumber: updated.submittalNumber,
          revision: updated.revision,
          status: input.status,
        },
      });
    } else if (input.status === "REJECTED" || input.status === "REVISE_AND_RESUBMIT") {
      await this.audit.log({
        orgId,
        userId,
        action: SUBMITTAL_DOMAIN_EVENTS.SUBMITTAL_REJECTED,
        entity: "domain_event",
        entityId: input.submittalId,
        newValue: {
          submittalId: input.submittalId,
          submittalNumber: updated.submittalNumber,
          revision: updated.revision,
          status: input.status,
        },
      });
    }

    return updated;
  }

  /**
   * 6.3.6 — Get submittal by ID.
   */
  async getSubmittal(orgId: string, id: string): Promise<SubmittalWithDetails> {
    const submittal = await this.repo.findById(orgId, id);
    if (!submittal) {
      throw new NotFoundError("Submittal not found");
    }
    return submittal;
  }

  /**
   * 6.3.6 — List submittals with filters and pagination.
   */
  async listSubmittals(
    orgId: string,
    filters?: SubmittalFilters,
  ): Promise<{ items: SubmittalWithDetails[]; total: number }> {
    return this.repo.list(orgId, filters);
  }
}

export const submittalService = new SubmittalService();
