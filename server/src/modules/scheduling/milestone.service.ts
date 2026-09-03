import type { Milestone } from "@prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "../../common/index.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import type { ProjectRepository } from "../projects/project.repository.js";
import { projectRepository } from "../projects/project.repository.js";
import type { TaskRepository } from "./task.repository.js";
import { taskRepository } from "./task.repository.js";
import {
  milestoneRepository,
  type MilestoneFilters,
  type MilestoneRepository,
} from "./milestone.repository.js";
import { TASK_AUDIT_ACTIONS } from "./task.types.js";

export interface CreateMilestoneInput {
  name: string;
  description?: string;
  dueDate: Date;
  linkedTaskId?: string | null;
}

export interface UpdateMilestoneInput {
  name?: string;
  description?: string | null;
  dueDate?: Date;
  status?: string;
  linkedTaskId?: string | null;
}

export class MilestoneService {
  constructor(
    private readonly repo: MilestoneRepository = milestoneRepository,
    private readonly projects: ProjectRepository = projectRepository,
    private readonly tasks: TaskRepository = taskRepository,
    private readonly audit: AuditService = defaultAuditService,
  ) {}

  private async validateProject(orgId: string, projectId: string): Promise<void> {
    const project = await this.projects.findById(orgId, projectId);
    if (!project) throw new NotFoundError("Project not found");
  }

  private async validateLinkedTask(
    orgId: string,
    projectId: string,
    linkedTaskId: string | null | undefined,
  ): Promise<void> {
    if (!linkedTaskId) return;
    const task = await this.tasks.findById(orgId, linkedTaskId);
    if (!task || task.projectId !== projectId) {
      throw new ValidationError("Linked task must belong to the project");
    }
  }

  async createMilestone(
    orgId: string,
    projectId: string,
    userId: string,
    input: CreateMilestoneInput,
  ): Promise<Milestone> {
    await this.validateProject(orgId, projectId);
    if (input.dueDate.getTime() <= Date.now()) {
      throw new ValidationError("Milestone due date must be in the future");
    }
    await this.validateLinkedTask(orgId, projectId, input.linkedTaskId);
    const milestone = await this.repo.create({
      ...input,
      orgId,
      projectId,
      createdById: userId,
    });
    await this.audit.log({
      orgId,
      userId,
      action: TASK_AUDIT_ACTIONS.MILESTONE_CREATED,
      entity: "milestone",
      entityId: milestone.id,
      newValue: { projectId, name: milestone.name, dueDate: milestone.dueDate.toISOString() },
    });
    return milestone;
  }

  async listMilestones(orgId: string, projectId: string): Promise<Milestone[]> {
    await this.validateProject(orgId, projectId);
    return this.repo.findByProject(orgId, projectId);
  }

  async updateMilestone(
    orgId: string,
    milestoneId: string,
    userId: string,
    input: UpdateMilestoneInput,
  ): Promise<Milestone> {
    const milestone = await this.repo.findById(orgId, milestoneId);
    if (!milestone) throw new NotFoundError("Milestone not found");
    if (input.dueDate && input.dueDate.getTime() <= Date.now() && input.status !== "ACHIEVED") {
      throw new ValidationError("Milestone due date must be in the future");
    }
    await this.validateLinkedTask(orgId, milestone.projectId, input.linkedTaskId);
    const updated = await this.repo.update(orgId, milestoneId, input);
    await this.audit.log({
      orgId,
      userId,
      action: TASK_AUDIT_ACTIONS.MILESTONE_UPDATED,
      entity: "milestone",
      entityId: milestoneId,
      oldValue: { status: milestone.status, name: milestone.name },
      newValue: { ...input },
    });
    return updated;
  }

  async markAchieved(orgId: string, milestoneId: string, userId: string): Promise<Milestone> {
    const milestone = await this.repo.findById(orgId, milestoneId);
    if (!milestone) throw new NotFoundError("Milestone not found");
    if (milestone.status === "ACHIEVED") {
      throw new ConflictError("Milestone is already achieved");
    }
    const updated = await this.repo.update(orgId, milestoneId, { status: "ACHIEVED" });
    await this.audit.log({
      orgId,
      userId,
      action: TASK_AUDIT_ACTIONS.MILESTONE_ACHIEVED,
      entity: "milestone",
      entityId: milestoneId,
      oldValue: { status: milestone.status },
      newValue: { status: "ACHIEVED" },
    });
    return updated;
  }

  async checkMissedMilestones(orgId: string, projectId: string): Promise<Milestone[]> {
    await this.validateProject(orgId, projectId);
    const filters: MilestoneFilters = { status: "PENDING", dueDateBefore: new Date() };
    return this.repo.findByProject(orgId, projectId, filters);
  }

  async deleteMilestone(orgId: string, milestoneId: string, userId: string): Promise<Milestone> {
    const milestone = await this.repo.findById(orgId, milestoneId);
    if (!milestone) throw new NotFoundError("Milestone not found");
    const deleted = await this.repo.delete(orgId, milestoneId);
    await this.audit.log({
      orgId,
      userId,
      action: TASK_AUDIT_ACTIONS.MILESTONE_UPDATED,
      entity: "milestone",
      entityId: milestoneId,
      oldValue: { status: milestone.status },
    });
    return deleted;
  }
}

export const milestoneService = new MilestoneService();
