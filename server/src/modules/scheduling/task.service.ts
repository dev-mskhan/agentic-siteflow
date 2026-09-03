import type { ProjectRepository } from "../projects/project.repository.js";
import { projectRepository } from "../projects/project.repository.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import { db } from "../../infrastructure/database/client.js";
import { NotFoundError, ValidationError } from "../../common/index.js";
import { ConflictError } from "../../common/index.js";
import type { Prisma, Task, TaskStatus } from "@prisma/client";
import { taskRepository } from "./task.repository.js";
import type { TaskRepository } from "./task.repository.js";
import { taskHistoryRepository } from "./task-history.repository.js";
import type { TaskHistoryRepository } from "./task-history.repository.js";
import {
  taskDependencyRepository,
  type TaskDependencyRepository,
} from "./task-dependency.repository.js";
import {
  type CreateTaskDependencyInput,
  type CreateTaskInput,
  type DependencyType,
  type TaskFilters,
  type UpdateTaskInput,
} from "./task.types.js";
import { TASK_AUDIT_ACTIONS, TASK_STATUS_TRANSITIONS } from "./task.types.js";
import { wouldCreateCycle } from "./cycle-detection.js";
import {
  taskDateChangeRepository,
  type TaskDateChangeRepository,
} from "./task-date-change.repository.js";
import type { ScheduleBaselineRepository } from "./schedule-baseline.repository.js";
import { scheduleBaselineRepository } from "./schedule-baseline.repository.js";
import { TASK_DOMAIN_EVENTS } from "./task.types.js";

function serializeHistoryValue(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return `${value}`;
  }
  return JSON.stringify(value);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  return left === right;
}

/**
 * Business operations for scheduled project tasks.
 *
 * Repositories and the audit service are injected so the service can be used
 * without a database in unit tests.
 */
export class TaskService {
  private readonly repo: TaskRepository;
  private readonly historyRepo: TaskHistoryRepository;
  private readonly audit: AuditService;
  private readonly projects: ProjectRepository;
  private readonly dependencies: TaskDependencyRepository;
  private readonly dateChanges: TaskDateChangeRepository;
  private readonly baselines: ScheduleBaselineRepository;

  constructor(
    repo: TaskRepository = taskRepository,
    second: TaskHistoryRepository | ProjectRepository | AuditService = taskHistoryRepository,
    third: TaskHistoryRepository | ProjectRepository | AuditService = projectRepository,
    fourth: TaskHistoryRepository | ProjectRepository | AuditService = defaultAuditService,
    dependencyRepository: TaskDependencyRepository = taskDependencyRepository,
    dateChangeRepository: TaskDateChangeRepository = taskDateChangeRepository,
    baselineRepository: ScheduleBaselineRepository = scheduleBaselineRepository,
  ) {
    this.repo = repo;
    this.historyRepo = taskHistoryRepository;
    this.audit = defaultAuditService;
    this.projects = projectRepository;
    this.dependencies = dependencyRepository;
    this.dateChanges = dateChangeRepository;
    this.baselines = baselineRepository;

    for (const dependency of [second, third, fourth]) {
      if ("log" in dependency) this.audit = dependency;
      else if ("findById" in dependency) this.projects = dependency;
      else if ("findByTask" in dependency) this.historyRepo = dependency;
      else if ("record" in dependency) this.dateChanges = dependency;
    }
  }

  async createTask(
    orgId: string,
    projectId: string,
    userId: string,
    input: Omit<CreateTaskInput, "orgId" | "projectId" | "createdById">,
  ): Promise<Task> {
    const project = await this.projects.findById(orgId, projectId);
    if (!project || project.orgId !== orgId) throw new NotFoundError("Project not found");
    if (project.status === "COMPLETED" || project.status === "CANCELLED") {
      throw new ValidationError(
        `Cannot create a task for a ${project.status.toLowerCase()} project`,
      );
    }
    if (input.progress !== undefined && (input.progress < 0 || input.progress > 100)) {
      throw new ValidationError("Progress must be between 0 and 100");
    }

    const task = await this.repo.create({
      ...input,
      orgId,
      projectId,
      createdById: userId,
    });

    await this.audit.log({
      orgId,
      userId,
      action: TASK_AUDIT_ACTIONS.TASK_CREATED,
      entity: "task",
      entityId: task.id,
      newValue: { name: task.name, projectId, status: task.status },
    });

    return task;
  }

  async getTask(orgId: string, taskId: string): Promise<Task> {
    const task = await this.repo.findById(orgId, taskId);
    if (!task) throw new NotFoundError("Task not found");
    return task;
  }

  async listTasks(
    orgId: string,
    projectId: string,
    filters?: TaskFilters,
  ): Promise<Task[]> {
    return this.repo.findByProject(orgId, projectId, filters);
  }

  async updateTask(
    orgId: string,
    taskId: string,
    userId: string,
    input: UpdateTaskInput,
  ): Promise<Task> {
    const task = await this.getTask(orgId, taskId);
    if (input.progress !== undefined && (input.progress < 0 || input.progress > 100)) {
      throw new ValidationError("Progress must be between 0 and 100");
    }

    const changedFields = (Object.keys(input) as Array<keyof UpdateTaskInput>).filter(
      (field) => !valuesEqual(task[field], input[field]),
    );

    if (changedFields.length === 0) return task;
    if (
      changedFields.some((field) =>
        ["plannedStartDate", "plannedEndDate", "durationDays"].includes(field),
      )
    ) {
      throw new ValidationError("Reason is required for date changes");
    }

    const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const next = await tx.task.update({
        where: { id: taskId },
        data: input,
      });

      for (const field of changedFields) {
        await tx.taskHistory.create({
          data: {
            taskId,
            projectId: task.projectId,
            orgId,
            field,
            oldValue: serializeHistoryValue(task[field]),
            newValue: serializeHistoryValue(input[field]),
            changedById: userId,
          },
        });
      }

      return next;
    });

    await this.audit.log({
      orgId,
      userId,
      action: TASK_AUDIT_ACTIONS.TASK_UPDATED,
      entity: "task",
      entityId: taskId,
      oldValue: Object.fromEntries(
        changedFields.map((field) => [field, serializeHistoryValue(task[field])]),
      ),
      newValue: Object.fromEntries(
        changedFields.map((field) => [field, serializeHistoryValue(input[field])]),
      ),
    });

    if (task.status !== "DONE" && input.status === "DONE") {
      await this.audit.log({
        orgId,
        userId,
        action: TASK_DOMAIN_EVENTS.TASK_COMPLETED,
        entity: "domain_event",
        entityId: taskId,
        oldValue: { status: task.status },
        newValue: { event: TASK_DOMAIN_EVENTS.TASK_COMPLETED, taskId, projectId: task.projectId },
      });
    }

    return updated;
  }

  async transitionStatus(
    orgId: string,
    taskId: string,
    newStatus: TaskStatus,
    userId: string,
  ): Promise<Task> {
    const task = await this.getTask(orgId, taskId);
    const allowed = TASK_STATUS_TRANSITIONS[task.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new ValidationError(
        `Invalid task status transition from ${task.status} to ${newStatus}`,
      );
    }

    const now = new Date();
    const updateData: {
      status: TaskStatus;
      actualStartDate?: Date;
      actualEndDate?: Date;
    } = { status: newStatus };
    if (newStatus === "IN_PROGRESS") updateData.actualStartDate = now;
    if (newStatus === "DONE" || newStatus === "CANCELLED") updateData.actualEndDate = now;

    const history = [
      {
        field: "status",
        oldValue: serializeHistoryValue(task.status),
        newValue: serializeHistoryValue(newStatus),
      },
      ...(["actualStartDate", "actualEndDate"] as const)
        .filter((field) => field in updateData)
        .map((field) => ({
          field,
          oldValue: serializeHistoryValue(task[field]),
          newValue: serializeHistoryValue(updateData[field]),
        })),
    ];

    const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const next = await tx.task.update({
        where: { id: taskId },
        data: updateData,
      });
      for (const entry of history) {
        await tx.taskHistory.create({
          data: {
            taskId,
            projectId: task.projectId,
            orgId,
            field: entry.field,
            oldValue: entry.oldValue,
            newValue: entry.newValue,
            changedById: userId,
          },
        });
      }
      return next;
    });

    await this.audit.log({
      orgId,
      userId,
      action: TASK_AUDIT_ACTIONS.TASK_STATUS_CHANGED,
      entity: "task",
      entityId: taskId,
      oldValue: { status: task.status },
      newValue: { status: newStatus },
    });

    if (newStatus === "DONE") {
      await this.audit.log({
        orgId,
        userId,
        action: TASK_DOMAIN_EVENTS.TASK_COMPLETED,
        entity: "domain_event",
        entityId: taskId,
        oldValue: { status: task.status },
        newValue: { event: TASK_DOMAIN_EVENTS.TASK_COMPLETED, taskId, projectId: task.projectId },
      });
    }

    return updated;
  }

  async updateProgress(
    orgId: string,
    taskId: string,
    userId: string,
    progress: number,
  ): Promise<Task> {
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      throw new ValidationError("Progress must be between 0 and 100");
    }

    const task = await this.getTask(orgId, taskId);
    if (progress === 100 && task.status !== "DONE") {
      const allowed = TASK_STATUS_TRANSITIONS[task.status] ?? [];
      if (!allowed.includes("DONE")) {
        throw new ValidationError(
          `Invalid task status transition from ${task.status} to DONE`,
        );
      }

      const now = new Date();
      const updateData = {
        progress: 100,
        status: "DONE" as const,
        actualEndDate: now,
      };
      const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
        const next = await tx.task.update({
          where: { id: taskId },
          data: updateData,
        });
        for (const entry of [
          {
            field: "progress",
            oldValue: serializeHistoryValue(task.progress),
            newValue: "100",
          },
          {
            field: "status",
            oldValue: serializeHistoryValue(task.status),
            newValue: "DONE",
          },
          {
            field: "actualEndDate",
            oldValue: serializeHistoryValue(task.actualEndDate),
            newValue: now.toISOString(),
          },
        ]) {
          await tx.taskHistory.create({
            data: {
              taskId,
              projectId: task.projectId,
              orgId,
              field: entry.field,
              oldValue: entry.oldValue,
              newValue: entry.newValue,
              changedById: userId,
            },
          });
        }
        return next;
      });

      await this.audit.log({
        orgId,
        userId,
        action: TASK_AUDIT_ACTIONS.TASK_STATUS_CHANGED,
        entity: "task",
        entityId: taskId,
        oldValue: { status: task.status, progress: task.progress },
        newValue: { status: "DONE", progress: 100 },
      });
      await this.audit.log({
        orgId,
        userId,
        action: TASK_DOMAIN_EVENTS.TASK_COMPLETED,
        entity: "domain_event",
        entityId: taskId,
        oldValue: { status: task.status, progress: task.progress },
        newValue: {
          event: TASK_DOMAIN_EVENTS.TASK_COMPLETED,
          taskId,
          projectId: task.projectId,
          status: "DONE",
          progress: 100,
        },
      });
      return updated;
    }

    return this.updateTask(orgId, taskId, userId, { progress });
  }

  async updateTaskDates(
    orgId: string,
    taskId: string,
    userId: string,
    input: {
      plannedStartDate?: Date | null;
      plannedEndDate?: Date | null;
      durationDays?: number | null;
      reason?: string;
    },
  ): Promise<Task> {
    if (!input.reason || input.reason.trim().length === 0) {
      throw new ValidationError("Reason is required for date changes");
    }
    if (
      input.durationDays !== undefined &&
      input.durationDays !== null &&
      (!Number.isInteger(input.durationDays) || input.durationDays <= 0)
    ) {
      throw new ValidationError("Duration must be a positive integer");
    }
    if (
      input.plannedStartDate &&
      input.plannedEndDate &&
      input.plannedEndDate.getTime() < input.plannedStartDate.getTime()
    ) {
      throw new ValidationError("Planned end date must be on or after planned start date");
    }

    const task = await this.getTask(orgId, taskId);
    const fields = ["plannedStartDate", "plannedEndDate", "durationDays"] as const;
    const changedFields = fields.filter(
      (field) =>
        input[field] !== undefined && !valuesEqual(task[field], input[field]),
    );
    if (changedFields.length === 0) {
      await this.audit.log({
        orgId,
        userId,
        action: TASK_DOMAIN_EVENTS.TASK_DATE_CHANGED,
        entity: "domain_event",
        entityId: taskId,
        newValue: {
          event: TASK_DOMAIN_EVENTS.TASK_DATE_CHANGED,
          taskId,
          projectId: task.projectId,
          changedFields: [],
          reason: input.reason,
        },
      });
      return task;
    }

    const data = Object.fromEntries(
      changedFields.map((field) => [field, input[field]]),
    ) as {
      plannedStartDate?: Date | null;
      plannedEndDate?: Date | null;
      durationDays?: number | null;
    };

    const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const next = await tx.task.update({ where: { id: taskId }, data });
      for (const field of changedFields) {
        await this.dateChanges.record(
          {
            taskId,
            projectId: task.projectId,
            orgId,
            field,
            oldValue: serializeHistoryValue(task[field]),
            newValue: serializeHistoryValue(input[field]),
            reason: input.reason!,
            changedById: userId,
          },
          tx,
        );
      }
      return next;
    });

    await this.audit.log({
      orgId,
      userId,
      action: TASK_AUDIT_ACTIONS.TASK_DATE_CHANGED,
      entity: "task",
      entityId: taskId,
      oldValue: Object.fromEntries(
        changedFields.map((field) => [field, serializeHistoryValue(task[field])]),
      ),
      newValue: {
        ...Object.fromEntries(
          changedFields.map((field) => [field, serializeHistoryValue(input[field])]),
        ),
        reason: input.reason,
      },
    });
    await this.audit.log({
      orgId,
      userId,
      action: TASK_DOMAIN_EVENTS.TASK_DATE_CHANGED,
      entity: "domain_event",
      entityId: taskId,
      newValue: {
        event: TASK_DOMAIN_EVENTS.TASK_DATE_CHANGED,
        taskId,
        projectId: task.projectId,
        changedFields,
        reason: input.reason,
      },
    });

    if (changedFields.includes("plannedEndDate") && updated.plannedEndDate) {
      const baseline = await this.baselines.findByProject(orgId, task.projectId);
      const snapshot = Array.isArray(baseline?.taskSnapshots)
        ? baseline.taskSnapshots.find(
            (entry): entry is { taskId: string; plannedEndDate?: string | null } =>
              typeof entry === "object" &&
              entry !== null &&
              typeof (entry as { taskId?: unknown }).taskId === "string" &&
              (entry as { taskId: string }).taskId === taskId,
          )
        : undefined;
      const baselineEndDate =
        snapshot && typeof snapshot.plannedEndDate === "string"
          ? new Date(snapshot.plannedEndDate)
          : null;
      if (baselineEndDate && updated.plannedEndDate.getTime() > baselineEndDate.getTime()) {
        await this.audit.log({
          orgId,
          userId,
          action: TASK_DOMAIN_EVENTS.TASK_DELAYED,
          entity: "domain_event",
          entityId: taskId,
          oldValue: { baselineEndDate: baselineEndDate.toISOString() },
          newValue: {
            event: TASK_DOMAIN_EVENTS.TASK_DELAYED,
            taskId,
            projectId: task.projectId,
            plannedEndDate: updated.plannedEndDate.toISOString(),
            baselineEndDate: baselineEndDate.toISOString(),
            reason: input.reason,
          },
        });
      }
    }
    return updated;
  }

  private validateDependencyOptions(type: DependencyType = "FS", lagDays = 0): void {
    if (!["FS", "SS", "FF", "SF"].includes(type)) {
      throw new ValidationError("Unsupported dependency type");
    }
    if (!Number.isInteger(lagDays)) {
      throw new ValidationError("Lag days must be an integer");
    }
  }

  private async validateDependencyTasks(
    orgId: string,
    projectId: string,
    predecessorId: string,
    successorId: string,
  ): Promise<void> {
    const [predecessor, successor] = await Promise.all([
      this.getTask(orgId, predecessorId),
      this.getTask(orgId, successorId),
    ]);
    if (
      predecessor.orgId !== orgId ||
      successor.orgId !== orgId ||
      predecessor.projectId !== projectId ||
      successor.projectId !== projectId ||
      predecessor.projectId !== successor.projectId
    ) {
      throw new ValidationError("Both tasks must belong to the same project");
    }
  }

  async validateNoCycle(
    orgId: string,
    projectId: string,
    predecessorId: string,
    successorId: string,
  ): Promise<void> {
    const dependencies = await this.dependencies.findByProject(orgId, projectId);
    const edges = dependencies.map(({ predecessorId: from, successorId: to }) => ({
      from,
      to,
    }));
    if (wouldCreateCycle(edges, predecessorId, successorId)) {
      throw new ValidationError("Adding this dependency would create a circular dependency");
    }
  }

  async addDependency(
    orgId: string,
    projectId: string,
    predecessorId: string,
    successorId: string,
    userId: string,
    type: DependencyType = "FS",
    lagDays = 0,
  ) {
    if (predecessorId === successorId) {
      throw new ValidationError("A task cannot depend on itself");
    }
    this.validateDependencyOptions(type, lagDays);
    await this.validateDependencyTasks(orgId, projectId, predecessorId, successorId);
    await this.validateNoCycle(orgId, projectId, predecessorId, successorId);

    let dependency;
    try {
      dependency = await db.$transaction(async (tx: Prisma.TransactionClient) => {
        const existing = await this.dependencies.findByProject(orgId, projectId, tx);
        if (
          existing.some(
            (item) =>
              item.predecessorId === predecessorId && item.successorId === successorId,
          )
        ) {
          throw new ConflictError("Dependency already exists");
        }

        const edges = existing.map(({ predecessorId: from, successorId: to }) => ({
          from,
          to,
        }));
        if (wouldCreateCycle(edges, predecessorId, successorId)) {
          throw new ValidationError("Adding this dependency would create a circular dependency");
        }

        const input: CreateTaskDependencyInput = {
          orgId,
          projectId,
          predecessorId,
          successorId,
          type,
          lagDays,
        };
        return this.dependencies.add(input, tx);
      });
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: unknown }).code === "P2002"
      ) {
        throw new ConflictError("Dependency already exists");
      }
      throw err;
    }

    await this.audit.log({
      orgId,
      userId,
      action: TASK_AUDIT_ACTIONS.TASK_DEPENDENCY_ADDED,
      entity: "task",
      entityId: successorId,
      newValue: {
        projectId,
        predecessorId,
        successorId,
        type,
        lagDays,
      },
    });
    return dependency;
  }

  async removeDependency(
    orgId: string,
    projectId: string,
    predecessorId: string,
    successorId: string,
    userId: string,
  ) {
    if (predecessorId === successorId) {
      throw new ValidationError("A task cannot depend on itself");
    }
    await this.validateDependencyTasks(orgId, projectId, predecessorId, successorId);

    const dependency = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await this.dependencies.findByProject(orgId, projectId, tx);
      const match = existing.find(
        (item) =>
          item.predecessorId === predecessorId && item.successorId === successorId,
      );
      if (!match) throw new NotFoundError("Dependency not found");
      return this.dependencies.remove(
        orgId,
        projectId,
        predecessorId,
        successorId,
        tx,
      );
    });

    await this.audit.log({
      orgId,
      userId,
      action: TASK_AUDIT_ACTIONS.TASK_DEPENDENCY_REMOVED,
      entity: "task",
      entityId: successorId,
      oldValue: { projectId, predecessorId, successorId },
    });
    return dependency;
  }

  async listDependencies(orgId: string, taskId: string) {
    await this.getTask(orgId, taskId);
    const [predecessors, successors] = await Promise.all([
      this.dependencies.findPredecessors(orgId, taskId),
      this.dependencies.findSuccessors(orgId, taskId),
    ]);
    return { predecessors, successors };
  }
}

export const taskService = new TaskService();
