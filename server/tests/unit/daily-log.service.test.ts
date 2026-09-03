import { describe, expect, it, vi } from "vitest";
import type { DailyLog, Project } from "@prisma/client";
import { ConflictError, ValidationError } from "../../src/common/index.js";
import { DailyLogService } from "../../src/modules/field-ops/daily-log.service.js";
import type { DailyLogRepository } from "../../src/modules/field-ops/daily-log.repository.js";
import type { ProjectRepository } from "../../src/modules/projects/project.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";

const day = (offset: number) => {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + offset);
  return value;
};
const project = { id: "project_1", orgId: "org_1", status: "ACTIVE" } as Project;
const log = (overrides: Partial<DailyLog> = {}) => ({
  id: "log_1", projectId: "project_1", orgId: "org_1", logDate: day(-1),
  weather: null, temperature: null, siteConditions: null, workerCount: 4,
  subcontractorCount: 1, equipmentNotes: null, workPerformed: "Foundation",
  quantitiesCompleted: null, deliveries: null, delays: null, safetyEvents: null,
  notes: null, createdById: "user_1", createdAt: new Date(), updatedAt: new Date(), ...overrides,
}) as DailyLog;

function setup(existing: DailyLog | null = null) {
  const repo = {
    create: vi.fn().mockResolvedValue(log()),
    findByDate: vi.fn().mockResolvedValue(existing),
    findById: vi.fn().mockResolvedValue(log()),
    findByProject: vi.fn().mockResolvedValue([log()]),
    update: vi.fn().mockResolvedValue(log()),
  } as unknown as DailyLogRepository;
  const projects = { findById: vi.fn().mockResolvedValue(project) } as unknown as ProjectRepository;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { service: new DailyLogService(repo, projects, audit), repo, projects, audit };
}

describe("DailyLogService", () => {
  it("rejects logs for projects that are not active", async () => {
    const inactive = setup();
    vi.mocked(inactive.projects.findById).mockResolvedValue({
      ...project,
      status: "DRAFT",
    });
    await expect(inactive.service.createLog("org_1", "project_1", "user_1", {
      logDate: day(-1), workPerformed: "Work",
    })).rejects.toThrow("Daily logs can only be created for ACTIVE projects");
  });

  it("rejects future dates and duplicate project dates", async () => {
    const future = setup();
    await expect(future.service.createLog("org_1", "project_1", "user_1", {
      logDate: day(1), workPerformed: "Work",
    })).rejects.toBeInstanceOf(ValidationError);
    const duplicate = setup(log());
    await expect(duplicate.service.createLog("org_1", "project_1", "user_1", {
      logDate: day(-1), workPerformed: "Work",
    })).rejects.toBeInstanceOf(ConflictError);
  });

  it("only allows edits within seven days of creation", async () => {
    const { service } = setup();
    await expect(service.updateLog("org_1", "log_1", "user_1", {
      workPerformed: "Updated",
    })).resolves.toBeDefined();
    const old = setup();
    vi.mocked(old.repo.findById).mockResolvedValue(log({ createdAt: new Date(Date.now() - 8 * 86_400_000) }));
    await expect(old.service.updateLog("org_1", "log_1", "user_1", {
      workPerformed: "Updated",
    })).rejects.toThrow("Daily logs can only be edited within 7 days of creation");
  });

  it("lists logs with organization, project, and pagination filters", async () => {
    const { service, repo } = setup();
    await service.listLogs("org_1", "project_1", { from: day(-7), limit: 10, offset: 2 });
    expect(repo.findByProject).toHaveBeenCalledWith("org_1", "project_1", {
      from: day(-7),
      limit: 10,
      offset: 2,
    });
  });
});
