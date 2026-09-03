import type { MaterialRequest } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../common/AppError.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import {
  materialRequestRepository as defaultMaterialRequestRepo,
  type MaterialRequestRepository,
  type MaterialRequestWithItems,
} from "./material-request.repository.js";
import {
  MATERIAL_REQUEST_AUDIT_ACTIONS,
  MATERIAL_REQUEST_STATUS_TRANSITIONS,
  type CreateMaterialRequestInput,
  type MaterialRequestFilters,
} from "./material-request.types.js";

export interface ProjectLookup {
  findById(orgId: string, projectId: string): Promise<{ id: string; status: string } | null>;
}

export class MaterialRequestService {
  constructor(
    private readonly repo: MaterialRequestRepository = defaultMaterialRequestRepo,
    private readonly audit: AuditService = defaultAuditService,
    private readonly projectLookup?: ProjectLookup,
  ) {}

  /**
   * 5.4.9 — Create a new material request.
   * Validates project exists and is ACTIVE, generates sequential requestNumber,
   * creates header + items atomically, logs audit.
   */
  async createRequest(
    orgId: string,
    projectId: string,
    userId: string,
    input: CreateMaterialRequestInput,
  ): Promise<MaterialRequestWithItems> {
    // Validate project exists and is ACTIVE
    if (this.projectLookup) {
      const project = await this.projectLookup.findById(orgId, projectId);
      if (!project) {
        throw new NotFoundError("Project not found");
      }
      if (project.status !== "ACTIVE") {
        throw new ValidationError("Material requests can only be created for ACTIVE projects");
      }
    }

    if (!input.title?.trim()) {
      throw new ValidationError("Title is required");
    }

    if (!input.items || input.items.length === 0) {
      throw new ValidationError("At least one item is required");
    }

    // Generate sequential requestNumber
    const count = await this.repo.countByOrg(orgId);
    const requestNumber = `MR-${String(count + 1).padStart(4, "0")}`;

    const request = await this.repo.create(orgId, projectId, userId, requestNumber, input);

    await this.audit.log({
      orgId,
      userId,
      action: MATERIAL_REQUEST_AUDIT_ACTIONS.MATERIAL_REQUEST_CREATED,
      entity: "material_request",
      entityId: request.id,
      newValue: {
        requestNumber,
        title: request.title,
        priority: request.priority,
        itemCount: request.items.length,
      },
    });

    return request;
  }

  /**
   * 5.4.10 — Submit a request.
   * Validates request has at least one item, transitions DRAFT → SUBMITTED, logs audit.
   */
  async submitRequest(
    orgId: string,
    requestId: string,
    userId: string,
  ): Promise<MaterialRequestWithItems> {
    const request = await this.getRequest(orgId, requestId);

    this.validateTransition(request.status, "SUBMITTED");

    const itemCount = await this.repo.countItems(request.id);
    if (itemCount === 0) {
      throw new ValidationError("Cannot submit a request with no items");
    }

    const updated = await this.repo.update(orgId, requestId, {
      status: "SUBMITTED",
    });

    await this.audit.log({
      orgId,
      userId,
      action: MATERIAL_REQUEST_AUDIT_ACTIONS.MATERIAL_REQUEST_SUBMITTED,
      entity: "material_request",
      entityId: requestId,
      oldValue: { status: request.status },
      newValue: { status: "SUBMITTED" },
    });

    return updated;
  }

  /**
   * 5.4.11 — Approve a request.
   * Validates status is SUBMITTED, sets approvedById, approvedAt=now(), status=APPROVED, logs audit.
   */
  async approveRequest(
    orgId: string,
    requestId: string,
    userId: string,
  ): Promise<MaterialRequestWithItems> {
    const request = await this.getRequest(orgId, requestId);

    this.validateTransition(request.status, "APPROVED");

    const updated = await this.repo.update(orgId, requestId, {
      status: "APPROVED",
      approvedById: userId,
      approvedAt: new Date(),
    });

    await this.audit.log({
      orgId,
      userId,
      action: MATERIAL_REQUEST_AUDIT_ACTIONS.MATERIAL_REQUEST_APPROVED,
      entity: "material_request",
      entityId: requestId,
      oldValue: { status: request.status },
      newValue: { status: "APPROVED", approvedById: userId },
    });

    return updated;
  }

  /**
   * 5.4.12 — Reject a request.
   * Requires non-empty reason, sets status=REJECTED, rejectionReason, logs audit.
   */
  async rejectRequest(
    orgId: string,
    requestId: string,
    userId: string,
    reason: string,
  ): Promise<MaterialRequestWithItems> {
    const request = await this.getRequest(orgId, requestId);

    if (!reason?.trim()) {
      throw new ValidationError("Rejection reason is required");
    }

    this.validateTransition(request.status, "REJECTED");

    const updated = await this.repo.update(orgId, requestId, {
      status: "REJECTED",
      rejectionReason: reason,
    });

    await this.audit.log({
      orgId,
      userId,
      action: MATERIAL_REQUEST_AUDIT_ACTIONS.MATERIAL_REQUEST_REJECTED,
      entity: "material_request",
      entityId: requestId,
      oldValue: { status: request.status },
      newValue: { status: "REJECTED", rejectionReason: reason },
    });

    return updated;
  }

  /**
   * 5.4.13 — Get a single material request with items.
   */
  async getRequest(
    orgId: string,
    requestId: string,
  ): Promise<MaterialRequestWithItems> {
    const request = await this.repo.findById(orgId, requestId);
    if (!request || request.orgId !== orgId) {
      throw new NotFoundError("Material request not found");
    }
    return request;
  }

  /**
   * 5.4.13 — List material requests for a project with optional filters.
   */
  async listRequests(
    orgId: string,
    projectId: string,
    filters: MaterialRequestFilters = {},
  ): Promise<MaterialRequest[]> {
    return this.repo.findByProject(orgId, projectId, filters);
  }

  /**
   * Validates that a status transition is allowed per the state machine.
   */
  private validateTransition(
    currentStatus: MaterialRequest["status"],
    targetStatus: MaterialRequest["status"],
  ): void {
    const allowed = MATERIAL_REQUEST_STATUS_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw new ValidationError(
        `Cannot transition from ${currentStatus} to ${targetStatus}`,
      );
    }
  }
}

export const materialRequestService = new MaterialRequestService();
