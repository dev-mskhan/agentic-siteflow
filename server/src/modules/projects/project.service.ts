import type { ProjectRole, ProjectStatus } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import { ConflictError, NotFoundError, ValidationError } from "../../common/index.js";
import type { ProjectRepository, CreateProjectInput, ProjectFilters } from "./project.repository.js";
import type { ProjectMemberRepository } from "./project-member.repository.js";
import type { ProjectSettingsRepository, UpdateProjectSettingsInput } from "./project-settings.repository.js";
import type { ProjectPhaseRepository, CreatePhaseInput, UpdatePhaseInput } from "./project-phase.repository.js";
import type { AuditService } from "../audit/audit.service.js";
import { STATUS_TRANSITIONS, TERMINAL_STATUSES, PROJECT_AUDIT_ACTIONS } from "./project.types.js";

export class ProjectService {
  constructor(
    private readonly repo: ProjectRepository,
    private readonly auditService: AuditService,
    private readonly memberRepo?: ProjectMemberRepository,
    private readonly settingsRepo?: ProjectSettingsRepository,
    private readonly phaseRepo?: ProjectPhaseRepository,
  ) {}

  // ─── Project CRUD ──────────────────────────────────────────────────────────

  async createProject(
    orgId: string,
    userId: string,
    input: Omit<CreateProjectInput, "orgId" | "createdById" | "projectNumber">,
  ) {
    if (!input.name?.trim()) throw new ValidationError("Project name is required");

    const count = await this.repo.countByOrg(orgId);
    const projectNumber = `PRJ-${String(count + 1).padStart(4, "0")}`;

    // Use a transaction to create project + default settings atomically
    const project = await db.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: { ...input, orgId, createdById: userId, projectNumber },
      });
      await tx.projectSettings.create({ data: { projectId: created.id } });
      return created;
    });

    await this.auditService.log({
      orgId,
      userId,
      action: PROJECT_AUDIT_ACTIONS.PROJECT_CREATED,
      entity: "project",
      entityId: project.id,
      newValue: { name: project.name, projectNumber },
    });

    return project;
  }

  async getProject(orgId: string, projectId: string) {
    const project = await this.repo.findById(orgId, projectId);
    if (!project) throw new NotFoundError("Project not found");
    return project;
  }

  async listProjects(orgId: string, filters?: ProjectFilters) {
    return this.repo.findByOrg(orgId, filters);
  }

  async updateProject(
    orgId: string,
    projectId: string,
    userId: string,
    input: Partial<Omit<CreateProjectInput, "orgId" | "createdById">>,
  ) {
    const project = await this.getProject(orgId, projectId);
    if (TERMINAL_STATUSES.includes(project.status)) {
      throw new ValidationError(`Cannot update a ${project.status.toLowerCase()} project`);
    }
    const updated = await this.repo.update(orgId, projectId, input);
    await this.auditService.log({
      orgId,
      userId,
      action: PROJECT_AUDIT_ACTIONS.PROJECT_UPDATED,
      entity: "project",
      entityId: projectId,
      oldValue: { name: project.name },
      newValue: { ...input },
    });
    return updated;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async transitionStatus(
    orgId: string,
    projectId: string,
    newStatus: ProjectStatus,
    userId: string,
    reason?: string,
  ) {
    const project = await this.getProject(orgId, projectId);
    const allowed = STATUS_TRANSITIONS[project.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new ValidationError(
        `Invalid status transition from ${project.status} to ${newStatus}`,
      );
    }

    const updateData: { status: typeof newStatus; actualStartDate?: Date; actualEndDate?: Date } = { status: newStatus };

    if (newStatus === "ACTIVE" && !project.actualStartDate) {
      updateData.actualStartDate = new Date();
    }
    if (newStatus === "COMPLETED" || newStatus === "CANCELLED") {
      updateData.actualEndDate = new Date();
    }

    const updated = await this.repo.update(orgId, projectId, updateData);

    await this.auditService.log({
      orgId,
      userId,
      action: PROJECT_AUDIT_ACTIONS.PROJECT_STATUS_CHANGED,
      entity: "project",
      entityId: projectId,
      oldValue: { status: project.status },
      newValue: { status: newStatus, ...(reason ? { reason } : {}) },
    });

    return updated;
  }

  // ─── Members ───────────────────────────────────────────────────────────────

  async addMember(
    orgId: string,
    projectId: string,
    input: { userId: string; role: ProjectRole; addedById: string },
  ) {
    if (!this.memberRepo) throw new Error("ProjectMemberRepository not injected");

    await this.getProject(orgId, projectId);

    // User must be an org member first
    const orgMember = await db.organizationMember.findUnique({
      where: { orgId_userId: { orgId, userId: input.userId } },
    });
    if (!orgMember) {
      throw new ValidationError(
        "User must be an org member before being added to a project",
      );
    }

    // Check not already a project member
    const existing = await this.memberRepo.findMembership(projectId, input.userId);
    if (existing) {
      throw new ConflictError("User is already a member of this project");
    }

    const member = await this.memberRepo.addMember({
      projectId,
      userId: input.userId,
      orgId,
      role: input.role,
      addedById: input.addedById,
    });

    await this.auditService.log({
      orgId,
      userId: input.addedById,
      action: PROJECT_AUDIT_ACTIONS.PROJECT_MEMBER_ADDED,
      entity: "project",
      entityId: projectId,
      newValue: { userId: input.userId, role: input.role },
    });

    return member;
  }

  async removeMember(orgId: string, projectId: string, userId: string) {
    if (!this.memberRepo) throw new Error("ProjectMemberRepository not injected");

    await this.getProject(orgId, projectId);
    await this.memberRepo.removeMember(projectId, userId);

    await this.auditService.log({
      orgId,
      userId,
      action: PROJECT_AUDIT_ACTIONS.PROJECT_MEMBER_REMOVED,
      entity: "project",
      entityId: projectId,
      newValue: { userId },
    });
  }

  async listProjectMembers(orgId: string, projectId: string) {
    if (!this.memberRepo) throw new Error("ProjectMemberRepository not injected");

    await this.getProject(orgId, projectId);
    return this.memberRepo.findByProject(projectId);
  }

  async updateMemberRole(
    orgId: string,
    projectId: string,
    userId: string,
    role: ProjectRole,
  ) {
    if (!this.memberRepo) throw new Error("ProjectMemberRepository not injected");

    await this.getProject(orgId, projectId);
    const updated = await this.memberRepo.updateRole(projectId, userId, role);

    await this.auditService.log({
      orgId,
      userId,
      action: PROJECT_AUDIT_ACTIONS.PROJECT_MEMBER_ROLE_CHANGED,
      entity: "project",
      entityId: projectId,
      newValue: { userId, role },
    });

    return updated;
  }

  // ─── Settings ──────────────────────────────────────────────────────────────

  async getProjectSettings(orgId: string, projectId: string) {
    if (!this.settingsRepo) throw new Error("ProjectSettingsRepository not injected");
    await this.getProject(orgId, projectId);
    return this.settingsRepo.findByProject(projectId);
  }

  async updateProjectSettings(
    orgId: string,
    projectId: string,
    userId: string,
    input: UpdateProjectSettingsInput,
  ) {
    if (!this.settingsRepo) throw new Error("ProjectSettingsRepository not injected");
    await this.getProject(orgId, projectId);
    const updated = await this.settingsRepo.upsert(projectId, input);

    await this.auditService.log({
      orgId,
      userId,
      action: PROJECT_AUDIT_ACTIONS.PROJECT_SETTINGS_UPDATED,
      entity: "project",
      entityId: projectId,
      newValue: { ...input },
    });

    return updated;
  }

  // ─── Phases ────────────────────────────────────────────────────────────────

  async createPhase(
    orgId: string,
    projectId: string,
    userId: string,
    input: Omit<CreatePhaseInput, "projectId" | "orgId" | "order">,
  ) {
    if (!this.phaseRepo) throw new Error("ProjectPhaseRepository not injected");

    await this.getProject(orgId, projectId);
    const count = await this.phaseRepo.countByProject(projectId);
    const phase = await this.phaseRepo.create({
      ...input,
      projectId,
      orgId,
      order: count,
    });

    await this.auditService.log({
      orgId,
      userId,
      action: PROJECT_AUDIT_ACTIONS.PHASE_CREATED,
      entity: "project",
      entityId: projectId,
      newValue: { phaseId: phase.id, name: phase.name },
    });

    return phase;
  }

  async listPhases(orgId: string, projectId: string) {
    if (!this.phaseRepo) throw new Error("ProjectPhaseRepository not injected");
    await this.getProject(orgId, projectId);
    return this.phaseRepo.findByProject(projectId);
  }

  async updatePhase(
    orgId: string,
    projectId: string,
    phaseId: string,
    userId: string,
    input: UpdatePhaseInput,
  ) {
    if (!this.phaseRepo) throw new Error("ProjectPhaseRepository not injected");

    const project = await this.getProject(orgId, projectId);
    const phase = await this.phaseRepo.findById(phaseId);
    if (!phase || phase.projectId !== project.id) {
      throw new NotFoundError("Phase not found in this project");
    }

    const updated = await this.phaseRepo.update(phaseId, input);

    await this.auditService.log({
      orgId,
      userId,
      action: PROJECT_AUDIT_ACTIONS.PHASE_UPDATED,
      entity: "project",
      entityId: projectId,
      newValue: { phaseId, ...input },
    });

    return updated;
  }

  async deletePhase(orgId: string, projectId: string, phaseId: string, userId: string) {
    if (!this.phaseRepo) throw new Error("ProjectPhaseRepository not injected");

    const project = await this.getProject(orgId, projectId);
    const phase = await this.phaseRepo.findById(phaseId);
    if (!phase || phase.projectId !== project.id) {
      throw new NotFoundError("Phase not found in this project");
    }

    // TODO (Phase 4): Guard against phases with assigned tasks
    // const taskCount = await db.task.count({ where: { phaseId } });
    // if (taskCount > 0) throw new ValidationError("Cannot delete phase with assigned tasks");

    await this.phaseRepo.delete(phaseId);

    await this.auditService.log({
      orgId,
      userId,
      action: PROJECT_AUDIT_ACTIONS.PHASE_DELETED,
      entity: "project",
      entityId: projectId,
      oldValue: { phaseId, name: phase.name },
    });
  }

  async reorderPhases(
    orgId: string,
    projectId: string,
    orderedIds: string[],
    userId: string,
  ) {
    if (!this.phaseRepo) throw new Error("ProjectPhaseRepository not injected");

    await this.getProject(orgId, projectId);
    const phases = await this.phaseRepo.findByProject(projectId);
    const phaseIds = new Set(phases.map((p) => p.id));

    for (const id of orderedIds) {
      if (!phaseIds.has(id)) {
        throw new ValidationError(`Phase ${id} does not belong to this project`);
      }
    }

    await this.phaseRepo.reorder(projectId, orderedIds);

    await this.auditService.log({
      orgId,
      userId,
      action: PROJECT_AUDIT_ACTIONS.PHASES_REORDERED,
      entity: "project",
      entityId: projectId,
      newValue: { orderedIds },
    });
  }
}
