import { SovStatus, type ScheduleOfValues } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../common/AppError.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import { projectRepository as defaultProjectRepository, type ProjectRepository } from "../projects/project.repository.js";
import { sovRepository as defaultSovRepo, type SovRepository } from "./sov.repository.js";
import {
  SOV_AUDIT_ACTIONS,
  type CreateSovInput,
  type SovDetail,
} from "./sov.types.js";

export class SovService {
  constructor(
    private readonly sovRepo: SovRepository = defaultSovRepo,
    private readonly projectRepo: ProjectRepository = defaultProjectRepository,
    private readonly audit: AuditService = defaultAuditService,
  ) {}

  async create(
    orgId: string,
    userId: string,
    input: CreateSovInput,
  ): Promise<SovDetail> {
    const project = await this.projectRepo.findById(orgId, input.projectId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }

    if (!input.title?.trim()) {
      throw new ValidationError("Title is required");
    }

    if (!input.items || input.items.length === 0) {
      throw new ValidationError("SOV must include at least one scheduled line item");
    }

    for (const it of input.items) {
      if (it.scheduledValue < 0) {
        throw new ValidationError("Line item scheduled value cannot be negative");
      }
    }

    const sov = await this.sovRepo.create(orgId, userId, input);

    await this.audit.log({
      orgId,
      userId,
      action: SOV_AUDIT_ACTIONS.SOV_CREATED,
      entity: "ScheduleOfValues",
      entityId: sov.id,
      newValue: {
        title: sov.title,
        totalScheduledValue: Number(sov.totalScheduledValue),
        itemsCount: sov.items.length,
      },
    });

    return sov;
  }

  async get(orgId: string, id: string): Promise<SovDetail> {
    const sov = await this.sovRepo.findById(orgId, id);
    if (!sov) {
      throw new NotFoundError("Schedule of values not found");
    }
    return sov;
  }

  async listByProject(orgId: string, projectId: string): Promise<SovDetail[]> {
    const project = await this.projectRepo.findById(orgId, projectId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }
    return this.sovRepo.listByProject(orgId, projectId);
  }

  async activate(orgId: string, userId: string, id: string): Promise<ScheduleOfValues> {
    const existing = await this.sovRepo.findById(orgId, id);
    if (!existing) {
      throw new NotFoundError("Schedule of values not found");
    }

    if (existing.status === SovStatus.ACTIVE) {
      throw new ValidationError("SOV is already active");
    }

    const activated = await this.sovRepo.activate(orgId, id);

    await this.audit.log({
      orgId,
      userId,
      action: SOV_AUDIT_ACTIONS.SOV_ACTIVATED,
      entity: "ScheduleOfValues",
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: activated.status },
    });

    return activated;
  }
}

export const sovService = new SovService();
