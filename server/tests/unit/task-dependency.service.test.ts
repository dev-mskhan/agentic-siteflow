import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task, TaskDependency } from "@prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "../../src/common/index.js";
import { TaskService } from "../../src/modules/scheduling/task.service.js";
import type { TaskRepository } from "../../src/modules/scheduling/task.repository.js";
import type { TaskHistoryRepository } from "../../src/modules/scheduling/task-history.repository.js";
import type { TaskDependencyRepository } from "../../src/modules/scheduling/task-dependency.repository.js";
import type { ProjectRepository } from "../../src/modules/projects/project.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";
import type { CreateTaskDependencyInput } from "../../src/modules/scheduling/task.types.js";

const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("../../src/infrastructure/database/client.js", () => ({
  db: {
    $transaction: transaction,
  },
}));

function makeTask(id: string, projectId = "project_1", orgId = "org_1"): Task {
  return {
    id,
    projectId,
    orgId,
    phaseId: null,
    costCodeId: null,
    assigneeId: null,
    name: id,
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
  };
}

function makeDependency(
  predecessorId: string,
  successorId: string,
  projectId = "project_1",
): TaskDependency {
  return {
    id: `${predecessorId}-${successorId}`,
    projectId,
    orgId: "org_1",
    predecessorId,
    successorId,
    type: "FS",
    lagDays: 0,
    createdAt: new Date("2024-01-01"),
  };
}

function setup(
  tasks: Task[] = [makeTask("A"), makeTask("B"), makeTask("C")],
  dependencies: TaskDependency[] = [],
) {
  const taskRepo = {
    findById: vi
      .fn()
      .mockImplementation((_orgId: string, id: string) =>
        Promise.resolve(tasks.find((task) => task.id === id) ?? null),
      ),
  } as unknown as TaskRepository;
  const dependencyRepo = {
    findByProject: vi.fn().mockResolvedValue(dependencies),
    findPredecessors: vi
      .fn()
      .mockResolvedValue(dependencies.filter((dependency) => dependency.successorId === "B")),
    findSuccessors: vi
      .fn()
      .mockResolvedValue(dependencies.filter((dependency) => dependency.predecessorId === "B")),
    add: vi.fn().mockImplementation((input: CreateTaskDependencyInput) =>
      Promise.resolve(makeDependency(input.predecessorId, input.successorId, input.projectId)),
    ),
    remove: vi
      .fn()
      .mockImplementation(
        (
          _org: string,
          _project: string,
          predecessorId: string,
          successorId: string,
        ) => Promise.resolve(makeDependency(predecessorId, successorId)),
      ),
  } as unknown as TaskDependencyRepository;
  const historyRepo = { findByTask: vi.fn() } as unknown as TaskHistoryRepository;
  const projects = {} as ProjectRepository;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const service = new TaskService(taskRepo, historyRepo, audit, projects, dependencyRepo);
  return { service, dependencyRepo, audit };
}

beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
    Promise.resolve(callback({})),
  );
});

describe("TaskService.addDependency", () => {
  it("rejects duplicate dependencies with ConflictError", async () => {
    const { service } = setup([makeTask("A"), makeTask("B")], [makeDependency("A", "B")]);
    await expect(service.addDependency("org_1", "project_1", "A", "B", "user_1")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("requires both tasks to be in the same organization and project", async () => {
    const { service } = setup([makeTask("A"), makeTask("B", "other_project")]);
    await expect(service.addDependency("org_1", "project_1", "A", "B", "user_1")).rejects.toThrow(
      "Both tasks must belong to the same project",
    );
    await expect(service.addDependency("org_1", "project_1", "A", "missing", "user_1")).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const otherOrg = setup([makeTask("A"), makeTask("B", "project_1", "other_org")]);
    await expect(
      otherOrg.service.addDependency("org_1", "project_1", "A", "B", "user_1"),
    ).rejects.toThrow("Both tasks must belong to the same project");
  });

  it("rejects self-dependencies with the exact validation message", async () => {
    const { service } = setup([makeTask("A")]);
    await expect(service.addDependency("org_1", "project_1", "A", "A", "user_1")).rejects.toThrow(
      "A task cannot depend on itself",
    );
  });

  it("rejects unsupported types and non-integer lag", async () => {
    const { service } = setup([makeTask("A"), makeTask("B")]);
    await expect(
      service.addDependency("org_1", "project_1", "A", "B", "user_1", "XX" as never),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.addDependency("org_1", "project_1", "A", "B", "user_1", "FS", 1.5),
    ).rejects.toThrow("Lag days must be an integer");
  });

  it("runs cycle validation in a transaction before creating", async () => {
    const { service, dependencyRepo } = setup(
      [makeTask("A"), makeTask("B"), makeTask("C")],
      [makeDependency("A", "B"), makeDependency("B", "C")],
    );
    await expect(
      service.addDependency("org_1", "project_1", "C", "A", "user_1"),
    ).rejects.toThrow("Adding this dependency would create a circular dependency");
    expect(dependencyRepo.add).not.toHaveBeenCalled();
  });

  it("creates a valid dependency and writes it within a transaction", async () => {
    const { service, dependencyRepo, audit } = setup([makeTask("A"), makeTask("B")]);
    await service.addDependency("org_1", "project_1", "A", "B", "user_1", "SS", -2);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(dependencyRepo.add).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SS", lagDays: -2 }),
      expect.anything(),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TASK_DEPENDENCY_ADDED" }),
    );
  });
});

describe("TaskService.removeDependency and listDependencies", () => {
  it("removes a dependency transactionally and audits it", async () => {
    const dependency = makeDependency("A", "B");
    const { service, dependencyRepo, audit } = setup([makeTask("A"), makeTask("B")], [dependency]);
    await service.removeDependency("org_1", "project_1", "A", "B", "user_1");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(dependencyRepo.remove).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TASK_DEPENDENCY_REMOVED" }),
    );
  });

  it("returns predecessors and successors separately", async () => {
    const dependency = makeDependency("A", "B");
    const { service } = setup([makeTask("A"), makeTask("B")], [dependency]);
    await expect(service.listDependencies("org_1", "B")).resolves.toEqual({
      predecessors: [dependency],
      successors: [],
    });
  });
});
