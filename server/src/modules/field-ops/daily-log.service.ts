import type { DailyLog } from "@prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "../../common/index.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import type { ProjectRepository } from "../projects/project.repository.js";
import { projectRepository } from "../projects/project.repository.js";
import {
  dailyLogRepository,
  type DailyLogRepository,
} from "./daily-log.repository.js";
import type { DailyLogFilters, DailyLogInput } from "./field-ops.types.js";
import { FIELD_OPS_AUDIT_ACTIONS } from "./field-ops.types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function assertCounts(input: Partial<DailyLogInput>): void {
  for (const [label, value] of [
    ["workerCount", input.workerCount],
    ["subcontractorCount", input.subcontractorCount],
  ] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
      throw new ValidationError(`${label} must be a non-negative integer`);
    }
  }
  if (input.temperature !== undefined && !Number.isInteger(input.temperature)) {
    throw new ValidationError("Temperature must be an integer");
  }
}

export class DailyLogService {
  constructor(
    private readonly repo: DailyLogRepository = dailyLogRepository,
    private readonly projects: ProjectRepository = projectRepository,
    private readonly audit: AuditService = defaultAuditService,
  ) {}

  private async activeProject(orgId: string, projectId: string): Promise<void> {
    const project = await this.projects.findById(orgId, projectId);
    if (!project) throw new NotFoundError("Project not found");
    if (project.status !== "ACTIVE") {
      throw new ValidationError("Daily logs can only be created for ACTIVE projects");
    }
  }

  private validateDate(logDate: Date): Date {
    const normalized = dateOnly(logDate);
    const today = dateOnly(new Date());
    if (normalized.getTime() > today.getTime()) {
      throw new ValidationError("Daily log date cannot be in the future");
    }
    return normalized;
  }

  async createLog(
    orgId: string,
    projectId: string,
    userId: string,
    input: DailyLogInput,
  ): Promise<DailyLog> {
    await this.activeProject(orgId, projectId);
    const logDate = this.validateDate(input.logDate);
    assertCounts(input);
    const existing = await this.repo.findByDate(orgId, projectId, logDate);
    if (existing) throw new ConflictError("A daily log already exists for this project and date");
    let log: DailyLog;
    try {
      log = await this.repo.create({ ...input, logDate, orgId, projectId, createdById: userId });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "P2002"
      ) {
        throw new ConflictError("A daily log already exists for this project and date");
      }
      throw error;
    }
    await this.audit.log({
      orgId,
      userId,
      action: FIELD_OPS_AUDIT_ACTIONS.DAILY_LOG_CREATED,
      entity: "daily_log",
      entityId: log.id,
      newValue: { projectId, logDate: log.logDate.toISOString() },
    });
    return log;
  }

  async updateLog(
    orgId: string,
    logId: string,
    userId: string,
    input: Partial<DailyLogInput>,
  ): Promise<DailyLog> {
    const log = await this.repo.findById(orgId, logId);
    if (!log) throw new NotFoundError("Daily log not found");
    if (Date.now() - log.createdAt.getTime() > 7 * DAY_MS) {
      throw new ValidationError("Daily logs can only be edited within 7 days of creation");
    }
    assertCounts(input);
    const data = { ...input, ...(input.logDate ? { logDate: this.validateDate(input.logDate) } : {}) };
    let updated: DailyLog;
    try {
      updated = await this.repo.update(orgId, logId, data);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "P2002"
      ) {
        throw new ConflictError("A daily log already exists for this project and date");
      }
      throw error;
    }
    await this.audit.log({
      orgId,
      userId,
      action: FIELD_OPS_AUDIT_ACTIONS.DAILY_LOG_UPDATED,
      entity: "daily_log",
      entityId: logId,
      oldValue: { logDate: log.logDate.toISOString() },
      newValue: { ...data },
    });
    return updated;
  }

  async listLogs(orgId: string, projectId: string, filters: DailyLogFilters = {}): Promise<DailyLog[]> {
    await this.projects.findById(orgId, projectId).then((project) => {
      if (!project) throw new NotFoundError("Project not found");
    });
    return this.repo.findByProject(orgId, projectId, filters);
  }

  async getLog(orgId: string, projectId: string, logDate: Date): Promise<DailyLog | null> {
    await this.projects.findById(orgId, projectId).then((project) => {
      if (!project) throw new NotFoundError("Project not found");
    });
    return this.repo.findByDate(orgId, projectId, dateOnly(logDate));
  }
}

export const dailyLogService = new DailyLogService();
