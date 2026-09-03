import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Task, TaskStatus } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../src/common/index.js";
import { TaskService } from "../../src/modules/scheduling/task.service.js";
import type { TaskRepository } from "../../src/modules/scheduling/task.repository.js";
import type { TaskHistoryRepository } from "../../src/modules/scheduling/task-history.repository.js";
import type { ProjectRepository } from "../../src/modules/projects/project.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";
import type { ScheduleBaselineRepository } from "../../src/modules/scheduling/schedule-baseline.repository.js";

const transactionTaskUpdate = vi.fn();
const transactionHistoryCreate = vi.fn();
const transactionDateChangeCreate = vi.fn();

vi.mock("../../src/infrastructure/database/client.js", () => ({
  db: {
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
      fn({
        task: { update: transactionTaskUpdate },
        taskHistory: { create: transactionHistoryCreate },
        taskDateChange: { create: transactionDateChangeCreate },
      }),
    ),
    task: { count: vi.fn() },
  },
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task_1",
    projectId: "project_1",
    orgId: "org_1",
    phaseId: null,
    costCodeId: null,
    assigneeId: null,
    name: "Pour foundation",
    description: null,
    status: "TODO",
    priority: "MEDIUM",
    plannedStartDate: null,
    plannedEndDate: null,
    actualStartDate: null,
    actualEndDate: null,
    durationDays: null,
    progress: 0,
    notes: null,
    createdById: "user_1",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project_1",
    orgId: "org_1",
    name: "Project",
    description: null,
    projectNumber: "PRJ-0001",
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
    plannedStartDate: null,
    plannedEndDate: null,
    actualStartDate: null,
    actualEndDate: null,
    budget: null,
    settings: {},
    createdById: "user_1",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function setup(
  task = makeTask(),
  project = makeProject(),
  baselineRepository?: ScheduleBaselineRepository,
) {
  const repo = {
    create: vi.fn().mockResolvedValue(task),
    findById: vi.fn().mockResolvedValue(task),
    findByProject: vi.fn().mockResolvedValue([task]),
  } as unknown as TaskRepository;
  const historyRepo = {} as TaskHistoryRepository;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const projects = {
    findById: vi.fn().mockResolvedValue(project),
  } as unknown as ProjectRepository;
  const baselines = baselineRepository ?? ({
    findByProject: vi.fn().mockResolvedValue(null),
  } as unknown as ScheduleBaselineRepository);
  return {
    service: new TaskService(repo, historyRepo, audit, projects, undefined, undefined, baselines),
    repo,
    audit,
    projects,
    baselines,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  transactionTaskUpdate.mockImplementation(({ data }: { data: Partial<Task> }) =>
    Promise.resolve(makeTask(data)),
  );
  transactionHistoryCreate.mockResolvedValue({});
  transactionDateChangeCreate.mockResolvedValue({});
});

function firstUpdateData(): Partial<Task> {
  return (
    transactionTaskUpdate.mock.calls[0]?.[0] as { data: Partial<Task> } | undefined
  )?.data ?? {};
}

describe("TaskService.createTask", () => {
  it("rejects tasks for completed projects", async () => {
    const { service } = setup(makeTask(), makeProject({ status: "COMPLETED" }));
    await expect(
      service.createTask("org_1", "project_1", "user_1", { name: "Task" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a project from another organization", async () => {
    const { service } = setup(makeTask(), makeProject({ orgId: "other_org" }));
    await expect(
      service.createTask("org_1", "project_1", "user_1", { name: "Task" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("TaskService.getTask and listTasks", () => {
  it("throws when a task is absent from the organization", async () => {
    const { service, repo } = setup();
    vi.mocked(repo.findById).mockResolvedValue(null);
    await expect(service.getTask("org_1", "missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("passes filters and pagination to the repository", async () => {
    const { service, repo } = setup();
    const filters = { status: "TODO" as TaskStatus, phaseId: "phase_1", assigneeId: "user_2", priority: "HIGH" as const, limit: 10, offset: 20 };
    await service.listTasks("org_1", "project_1", filters);
    expect(repo.findByProject).toHaveBeenCalledWith("org_1", "project_1", filters);
  });
});

describe("TaskService.updateTask", () => {
  it("records history for every changed field in a transaction", async () => {
    const { service, audit } = setup(makeTask({ priority: "LOW" }));
    await service.updateTask("org_1", "task_1", "user_1", {
      name: "Updated task",
      priority: "HIGH",
    });

    describe("TaskService.updateTaskDates", () => {
      it("requires a reason", async () => {
        const { service } = setup();
        await expect(
          service.updateTaskDates("org_1", "task_1", "user_1", {
            plannedStartDate: new Date("2024-02-01"),
          }),
        ).rejects.toThrow("Reason is required for date changes");
      });

      it("records one date change for every changed date field", async () => {
        const { service, audit } = setup(
          makeTask({
            plannedStartDate: new Date("2024-01-01"),
            plannedEndDate: new Date("2024-01-10"),
            durationDays: 10,
          }),
        );
        await service.updateTaskDates("org_1", "task_1", "user_1", {
          plannedStartDate: new Date("2024-01-02"),
          plannedEndDate: new Date("2024-01-12"),
          durationDays: 11,
          reason: "Owner-directed resequencing",
        });
        expect(transactionDateChangeCreate).toHaveBeenCalledTimes(3);
        expect(transactionDateChangeCreate.mock.calls.map(
          ([call]) => (call as { data: { field: string } }).data.field,
        )).toEqual(expect.arrayContaining([
          "plannedStartDate",
          "plannedEndDate",
          "durationDays",
        ]));
        expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
          action: "TASK_DATE_CHANGED",
        }));
      });
    });

    expect(transactionTaskUpdate).toHaveBeenCalled();
    expect(transactionHistoryCreate).toHaveBeenCalledTimes(2);
    expect(
      transactionHistoryCreate.mock.calls.map(
        ([call]) => (call as { data: { field: string } }).data.field,
      ),
    ).toEqual(
      expect.arrayContaining(["name", "priority"]),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TASK_UPDATED", entityId: "task_1" }),
    );
  });
});

describe("TaskService.transitionStatus", () => {
  it("sets actualStartDate for TODO to IN_PROGRESS", async () => {
    const { service } = setup();
    const result = await service.transitionStatus("org_1", "task_1", "IN_PROGRESS", "user_1");
    expect(result.status).toBe("IN_PROGRESS");
    expect(firstUpdateData().actualStartDate).toBeInstanceOf(Date);
  });

  it("sets actualEndDate for IN_PROGRESS to DONE", async () => {
    const { service, audit } = setup(makeTask({ status: "IN_PROGRESS" }));
    await service.transitionStatus("org_1", "task_1", "DONE", "user_1");
    expect(firstUpdateData().actualEndDate).toBeInstanceOf(Date);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: "TaskCompleted",
      entity: "domain_event",
      entityId: "task_1",
    }));
  });

  describe("TaskService.updateTaskDates audit events", () => {
    it("logs TaskDateChanged and TaskDelayed against the task", async () => {
      const baselines = {
        findByProject: vi.fn().mockResolvedValue({
          taskSnapshots: [{
            taskId: "task_1",
            plannedEndDate: "2024-01-10T00:00:00.000Z",
          }],
        }),
      } as unknown as ScheduleBaselineRepository;
      const { service, audit } = setup(
        makeTask({ plannedEndDate: new Date("2024-01-10") }),
        makeProject(),
        baselines,
      );

      await service.updateTaskDates("org_1", "task_1", "user_1", {
        plannedEndDate: new Date("2024-01-12"),
        reason: "Approved extension",
      });

      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: "TaskDateChanged",
        entity: "domain_event",
        entityId: "task_1",
      }));
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: "TaskDelayed",
        entity: "domain_event",
        entityId: "task_1",
      }));
    });
  });

  it("rejects transitions from terminal statuses", async () => {
    const { service } = setup(makeTask({ status: "DONE" }));
    await expect(
      service.transitionStatus("org_1", "task_1", "TODO", "user_1"),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("TaskService.updateProgress", () => {
  it("auto-transitions an in-progress task to DONE at 100", async () => {
    const { service } = setup(makeTask({ status: "IN_PROGRESS", progress: 80 }));
    const result = await service.updateProgress("org_1", "task_1", "user_1", 100);
    expect(result.status).toBe("DONE");
    expect(firstUpdateData()).toMatchObject({
      status: "DONE",
      progress: 100,
    });
  });

  it("rejects values over 100", async () => {
    const { service } = setup();
    await expect(service.updateProgress("org_1", "task_1", "user_1", 101)).rejects.toThrow(
      "Progress must be between 0 and 100",
    );
  });
});
