import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, ScheduleBaseline, Task, TaskDependency } from "@prisma/client";
import { NotFoundError } from "../../src/common/index.js";
import { ScheduleService } from "../../src/modules/scheduling/schedule.service.js";
import type { ScheduleBaselineRepository } from "../../src/modules/scheduling/schedule-baseline.repository.js";
import type { TaskRepository } from "../../src/modules/scheduling/task.repository.js";
import type { TaskDependencyRepository } from "../../src/modules/scheduling/task-dependency.repository.js";
import type { ProjectRepository } from "../../src/modules/projects/project.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const task = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  projectId: "project_1",
  orgId: "org_1",
  phaseId: null,
  costCodeId: null,
  assigneeId: null,
  name: id,
  description: null,
  status: "TODO",
  priority: "MEDIUM",
  plannedStartDate: date("2026-01-01"),
  plannedEndDate: date("2026-01-10"),
  actualStartDate: null,
  actualEndDate: null,
  durationDays: 10,
  progress: 0,
  notes: null,
  createdById: "user_1",
  createdAt: date("2026-01-01"),
  updatedAt: date("2026-01-01"),
  ...overrides,
});
const project = (overrides: Partial<Project> = {}): Project => ({
  id: "project_1",
  orgId: "org_1",
  name: "Project",
  description: null,
  projectNumber: null,
  status: "ACTIVE",
  projectType: null,
  currency: "USD",
  clientName: null,
  clientContact: null,
  siteAddress: null,
  siteCity: null,
  siteCountry: null,
  contractValue: null,
  contractDate: null,
  plannedStartDate: date("2026-01-01"),
  plannedEndDate: date("2026-01-31"),
  actualStartDate: null,
  actualEndDate: null,
  budget: null,
  settings: {},
  createdById: "user_1",
  createdAt: date("2026-01-01"),
  updatedAt: date("2026-01-01"),
  ...overrides,
});

function baseline(taskSnapshots: unknown): ScheduleBaseline {
  return {
    id: "baseline_1",
    projectId: "project_1",
    orgId: "org_1",
    name: "Original Baseline",
    capturedAt: date("2026-01-01"),
    capturedById: "user_1",
    taskSnapshots: taskSnapshots as ScheduleBaseline["taskSnapshots"],
    createdAt: date("2026-01-01"),
  };
}

describe("ScheduleService", () => {
  beforeEach(() => vi.clearAllMocks());

  function setup(tasks: Task[] = [task("A"), task("B")], deps: TaskDependency[] = []) {
    const baselines = {
      capture: vi.fn().mockResolvedValue(baseline([])),
      replace: vi.fn().mockResolvedValue(baseline([])),
      findByProject: vi.fn().mockResolvedValue(null),
    } as unknown as ScheduleBaselineRepository;
    const taskRepo = {
      findByProject: vi.fn().mockResolvedValue(tasks),
      findById: vi.fn().mockImplementation((_org: string, id: string) =>
        tasks.find((value) => value.id === id) ?? null),
    } as unknown as TaskRepository;
    const projects = {
      findById: vi.fn().mockResolvedValue(project()),
    } as unknown as ProjectRepository;
    const dependencies = {
      findByProject: vi.fn().mockResolvedValue(deps),
    } as unknown as TaskDependencyRepository;
    const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    return {
      service: new ScheduleService(baselines, taskRepo, projects, dependencies, audit),
      baselines,
      taskRepo,
      projects,
      audit,
    };
  }

  it("captures every project task and replaces an existing baseline", async () => {
    const { service, baselines, audit } = setup([task("A"), task("B", { durationDays: null })]);
    await service.captureBaseline("org_1", "project_1", "user_1");
    expect(baselines.capture).toHaveBeenCalledWith(expect.objectContaining({
      orgId: "org_1",
      taskSnapshots: [
        expect.objectContaining({ taskId: "A", plannedStartDate: "2026-01-01T00:00:00.000Z" }),
        expect.objectContaining({ taskId: "B", durationDays: null }),
      ],
    }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: "SCHEDULE_BASELINE_CAPTURED",
    }));
  });

  it("replaces an existing baseline instead of creating a second one", async () => {
    const { service, baselines } = setup([task("A")]);
    vi.mocked(baselines.findByProject).mockResolvedValue(baseline([]));
    await service.captureBaseline("org_1", "project_1", "user_1", "Rebaseline");
    expect(baselines.capture).not.toHaveBeenCalled();
    expect(baselines.replace).toHaveBeenCalledWith(
      "project_1",
      expect.objectContaining({ name: "Rebaseline" }),
    );
  });

  it("returns null baseline only for an existing project", async () => {
    const { service } = setup();
    await expect(service.getBaseline("org_1", "project_1")).resolves.toBeNull();
    const missing = setup();
    vi.mocked(missing.projects.findById).mockResolvedValue(null);
    await expect(missing.service.getBaseline("org_1", "project_1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns all downstream tasks with dependency paths", async () => {
    const deps: TaskDependency[] = [
      { id: "1", orgId: "org_1", projectId: "project_1", predecessorId: "A", successorId: "B", type: "FS", lagDays: 0, createdAt: date("2026-01-01") },
      { id: "2", orgId: "org_1", projectId: "project_1", predecessorId: "B", successorId: "C", type: "FS", lagDays: 0, createdAt: date("2026-01-01") },
    ];
    const { service } = setup([task("A"), task("B"), task("C")], deps);
    await expect(service.getImpactedTasks("org_1", "project_1", "A")).resolves.toEqual([
      { taskId: "B", path: ["A", "B"] },
      { taskId: "C", path: ["A", "B", "C"] },
    ]);
  });

  it("returns the longest critical path for parallel task chains", async () => {
    const deps: TaskDependency[] = [
      { id: "1", orgId: "org_1", projectId: "project_1", predecessorId: "A", successorId: "B", type: "FS", lagDays: 0, createdAt: date("2026-01-01") },
      { id: "2", orgId: "org_1", projectId: "project_1", predecessorId: "B", successorId: "C", type: "FS", lagDays: 0, createdAt: date("2026-01-01") },
      { id: "3", orgId: "org_1", projectId: "project_1", predecessorId: "A", successorId: "D", type: "FS", lagDays: 0, createdAt: date("2026-01-01") },
    ];
    const tasks = [
      task("A", { durationDays: 2 }),
      task("B", { durationDays: 3 }),
      task("C", { durationDays: 4 }),
      task("D", { durationDays: 1 }),
    ];
    const { service } = setup(tasks, deps);
    await expect(service.getCriticalPath("org_1", "project_1")).resolves.toMatchObject({
      criticalPath: ["A", "B", "C"],
      totalDays: 9,
    });
  });

  it("returns a single task as the critical path", async () => {
    const { service } = setup([task("A", { durationDays: 5 })]);
    await expect(service.getCriticalPath("org_1", "project_1")).resolves.toMatchObject({
      criticalPath: ["A"],
      totalDays: 5,
    });
  });
});
