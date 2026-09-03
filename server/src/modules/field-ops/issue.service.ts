import type { Issue } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../common/index.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import type { ProjectRepository } from "../projects/project.repository.js";
import { projectRepository } from "../projects/project.repository.js";
import type { TaskRepository } from "../scheduling/task.repository.js";
import { taskRepository } from "../scheduling/task.repository.js";
import {
  issueRepository,
  type CreateIssueData,
  type IssueRepository,
} from "./issue.repository.js";
import type { IssueFilters } from "./field-ops.types.js";
import { FIELD_OPS_AUDIT_ACTIONS, FIELD_OPS_DOMAIN_EVENTS } from "./field-ops.types.js";

export type CreateIssueInput = Omit<CreateIssueData, "orgId" | "projectId" | "createdById">;
export type UpdateIssueInput = Partial<Omit<CreateIssueInput, "status">> & { status?: Issue["status"] };

export class IssueService {
  constructor(
    private readonly repo: IssueRepository = issueRepository,
    private readonly projects: ProjectRepository = projectRepository,
    private readonly tasks: TaskRepository = taskRepository,
    private readonly audit: AuditService = defaultAuditService,
  ) {}

  private async validateProject(orgId: string, projectId: string): Promise<void> {
    const project = await this.projects.findById(orgId, projectId);
    if (!project) throw new NotFoundError("Project not found");
  }

  private async validateTask(
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

  async createIssue(
    orgId: string,
    projectId: string,
    userId: string,
    input: CreateIssueInput,
  ): Promise<Issue> {
    await this.validateProject(orgId, projectId);
    if (input.hasCostImpact && input.costImpactAmount !== null && input.costImpactAmount !== undefined && input.costImpactAmount < 0) {
      throw new ValidationError("Cost impact amount cannot be negative");
    }
    if (input.hasScheduleImpact && input.scheduleImpactDays !== null && input.scheduleImpactDays !== undefined && input.scheduleImpactDays < 0) {
      throw new ValidationError("Schedule impact days cannot be negative");
    }
    await this.validateTask(orgId, projectId, input.linkedTaskId);
    const issue = await this.repo.create({ ...input, orgId, projectId, createdById: userId });
    await this.audit.log({
      orgId,
      userId,
      action: FIELD_OPS_AUDIT_ACTIONS.ISSUE_CREATED,
      entity: "issue",
      entityId: issue.id,
      newValue: { projectId, title: issue.title, priority: issue.priority },
    });
    await this.audit.log({
      orgId,
      userId,
      action: FIELD_OPS_DOMAIN_EVENTS.ISSUE_CREATED,
      entity: "domain_event",
      entityId: issue.id,
      newValue: { event: FIELD_OPS_DOMAIN_EVENTS.ISSUE_CREATED, issueId: issue.id, projectId },
    });
    return issue;
  }

  async getIssue(orgId: string, issueId: string): Promise<Issue> {
    const issue = await this.repo.findById(orgId, issueId);
    if (!issue) throw new NotFoundError("Issue not found");
    return issue;
  }

  async updateIssue(
    orgId: string,
    issueId: string,
    userId: string,
    input: UpdateIssueInput,
  ): Promise<Issue> {
    const issue = await this.getIssue(orgId, issueId);
    await this.validateTask(orgId, issue.projectId, input.linkedTaskId);
    const updated = await this.repo.update(orgId, issueId, input);
    await this.audit.log({
      orgId,
      userId,
      action: FIELD_OPS_AUDIT_ACTIONS.ISSUE_UPDATED,
      entity: "issue",
      entityId: issueId,
      oldValue: { status: issue.status, priority: issue.priority },
      newValue: input,
    });
    return updated;
  }

  async resolveIssue(
    orgId: string,
    issueId: string,
    userId: string,
    resolution: string,
  ): Promise<Issue> {
    const issue = await this.getIssue(orgId, issueId);
    if (issue.status === "RESOLVED" || issue.status === "CLOSED") {
      throw new ValidationError("Issue is already resolved or closed");
    }
    if (!resolution.trim()) throw new ValidationError("Resolution is required");
    const resolvedAt = new Date();
    const updated = await this.repo.update(orgId, issueId, {
      status: "RESOLVED",
      resolution: resolution.trim(),
      resolvedAt,
    });
    await this.audit.log({
      orgId,
      userId,
      action: FIELD_OPS_AUDIT_ACTIONS.ISSUE_RESOLVED,
      entity: "issue",
      entityId: issueId,
      oldValue: { status: issue.status },
      newValue: { status: "RESOLVED", resolution: resolution.trim(), resolvedAt: resolvedAt.toISOString() },
    });
    await this.audit.log({
      orgId,
      userId,
      action: FIELD_OPS_DOMAIN_EVENTS.ISSUE_RESOLVED,
      entity: "domain_event",
      entityId: issueId,
      newValue: { event: FIELD_OPS_DOMAIN_EVENTS.ISSUE_RESOLVED, issueId, projectId: issue.projectId },
    });
    return updated;
  }

  async listIssues(orgId: string, projectId: string, filters: IssueFilters = {}): Promise<Issue[]> {
    await this.validateProject(orgId, projectId);
    return this.repo.findByProject(orgId, projectId, filters);
  }
}

export const issueService = new IssueService();
