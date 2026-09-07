import { RetainageReleaseStatus, type RetainageRelease } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../common/AppError.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import { projectRepository as defaultProjectRepository, type ProjectRepository } from "../projects/project.repository.js";
import { retainageRepository as defaultRetainageRepo, type RetainageRepository } from "./retainage.repository.js";
import {
  RETAINAGE_AUDIT_ACTIONS,
  type ApproveRetainageReleaseInput,
  type RejectRetainageReleaseInput,
  type RequestRetainageReleaseInput,
  type RetainageReleaseDetail,
  type RetainageSummary,
} from "./retainage.types.js";
import { assertNotSelfApprover } from "./segregation.guard.js";

export class RetainageService {
  constructor(
    private readonly retainageRepo: RetainageRepository = defaultRetainageRepo,
    private readonly projectRepo: ProjectRepository = defaultProjectRepository,
    private readonly audit: AuditService = defaultAuditService,
  ) {}

  async getRetainageBalance(
    orgId: string,
    projectId: string,
    subcontractorId?: string,
    contractId?: string,
  ): Promise<RetainageSummary> {
    const project = await this.projectRepo.findById(orgId, projectId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }
    return this.retainageRepo.getRetainageBalance(orgId, projectId, subcontractorId, contractId);
  }

  async requestRelease(
    orgId: string,
    userId: string,
    input: RequestRetainageReleaseInput,
  ): Promise<RetainageRelease> {
    const project = await this.projectRepo.findById(orgId, input.projectId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }

    if (input.amountToRelease <= 0) {
      throw new ValidationError("Amount to release must be greater than 0");
    }

    const balance = await this.retainageRepo.getRetainageBalance(
      orgId,
      input.projectId,
      input.subcontractorId,
      input.contractId,
    );

    if (input.amountToRelease > balance.currentRetainageHeld) {
      throw new ValidationError(
        `Requested release amount ($${input.amountToRelease}) exceeds available retainage held ($${balance.currentRetainageHeld})`,
      );
    }

    const release = await this.retainageRepo.create(
      orgId,
      userId,
      input,
      balance.currentRetainageHeld,
    );

    await this.audit.log({
      orgId,
      userId,
      action: RETAINAGE_AUDIT_ACTIONS.RETAINAGE_RELEASE_REQUESTED,
      entity: "RetainageRelease",
      entityId: release.id,
      newValue: {
        releaseNumber: release.releaseNumber,
        amountToRelease: Number(release.amountToRelease),
        subcontractorId: input.subcontractorId,
      },
    });

    return release;
  }

  async approveRelease(
    orgId: string,
    userId: string,
    input: ApproveRetainageReleaseInput,
  ): Promise<RetainageRelease> {
    const release = await this.retainageRepo.findById(orgId, input.id);
    if (!release) {
      throw new NotFoundError("Retainage release request not found");
    }

    if (
      release.status !== RetainageReleaseStatus.REQUESTED &&
      release.status !== RetainageReleaseStatus.UNDER_REVIEW
    ) {
      throw new ValidationError(`Cannot approve retainage release in status '${release.status}'`);
    }

    // Segregation of duties: requester cannot approve release
    assertNotSelfApprover(release.requestedById, userId, "retainage release");

    const now = new Date();
    const approved = await this.retainageRepo.updateStatus(input.id, {
      status: RetainageReleaseStatus.APPROVED,
      lienWaiverVerified: input.lienWaiverVerified ?? true,
      approvedBy: { connect: { id: userId } },
      approvedAt: now,
    });

    await this.audit.log({
      orgId,
      userId,
      action: RETAINAGE_AUDIT_ACTIONS.RETAINAGE_RELEASE_APPROVED,
      entity: "RetainageRelease",
      entityId: input.id,
      oldValue: { status: release.status },
      newValue: {
        status: approved.status,
        approvedById: userId,
        lienWaiverVerified: approved.lienWaiverVerified,
      },
    });

    return approved;
  }

  async rejectRelease(
    orgId: string,
    userId: string,
    input: RejectRetainageReleaseInput,
  ): Promise<RetainageRelease> {
    const release = await this.retainageRepo.findById(orgId, input.id);
    if (!release) {
      throw new NotFoundError("Retainage release request not found");
    }

    // Segregation of duties
    assertNotSelfApprover(release.requestedById, userId, "retainage release");

    const rejected = await this.retainageRepo.updateStatus(input.id, {
      status: RetainageReleaseStatus.REJECTED,
      rejectionReason: input.rejectionReason,
    });

    await this.audit.log({
      orgId,
      userId,
      action: RETAINAGE_AUDIT_ACTIONS.RETAINAGE_RELEASE_REJECTED,
      entity: "RetainageRelease",
      entityId: input.id,
      oldValue: { status: release.status },
      newValue: { status: rejected.status, rejectionReason: input.rejectionReason },
    });

    return rejected;
  }

  async listReleases(
    orgId: string,
    projectId: string,
    subcontractorId?: string,
  ): Promise<RetainageReleaseDetail[]> {
    const project = await this.projectRepo.findById(orgId, projectId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }
    return this.retainageRepo.list(orgId, projectId, subcontractorId);
  }
}

export const retainageService = new RetainageService();
