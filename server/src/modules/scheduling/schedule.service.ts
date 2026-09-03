import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import { NotFoundError } from "../../common/index.js";
import type { ProjectRepository } from "../projects/project.repository.js";
import { projectRepository } from "../projects/project.repository.js";
import type { TaskRepository } from "./task.repository.js";
import { taskRepository } from "./task.repository.js";
import type { TaskDependencyRepository } from "./task-dependency.repository.js";
import { taskDependencyRepository } from "./task-dependency.repository.js";
import type { ScheduleBaselineRepository } from "./schedule-baseline.repository.js";
import { scheduleBaselineRepository } from "./schedule-baseline.repository.js";
import type { Prisma, ScheduleBaseline } from "@prisma/client";
import { TASK_AUDIT_ACTIONS } from "./task.types.js";
import {
  calcVarianceDays,
  calculateCriticalPath,
  findOverrunTasks,
  type TaskNode,
} from "./schedule-calc.js";

interface Snapshot {
  taskId: string;
  name: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  durationDays: number | null;
}

function taskDays(task: { durationDays: number | null; plannedStartDate: Date | null; plannedEndDate: Date | null }): number | null {
  if (task.durationDays !== null) return task.durationDays;
  if (!task.plannedStartDate || !task.plannedEndDate) return null;
  return Math.round((task.plannedEndDate.getTime() - task.plannedStartDate.getTime()) / 86_400_000) + 1;
}

function snapshotDays(snapshot: Snapshot): number | null {
  if (snapshot.durationDays !== null) return snapshot.durationDays;
  if (!snapshot.plannedStartDate || !snapshot.plannedEndDate) return null;
  return Math.round(
    (new Date(snapshot.plannedEndDate).getTime() - new Date(snapshot.plannedStartDate).getTime()) /
      86_400_000,
  ) + 1;
}

function readSnapshots(value: unknown): Snapshot[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Snapshot =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as { taskId?: unknown }).taskId === "string",
  );
}

export interface ScheduleVariance {
  tasks: Array<{
    taskId: string;
    name: string;
    baselineDays: number | null;
    currentDays: number | null;
    varianceDays: number | null;
    isDelayed: boolean;
  }>;
  overallVarianceDays: number;
  tasksAtRisk: string[];
}

export class ScheduleService {
  constructor(
    private readonly baselines: ScheduleBaselineRepository = scheduleBaselineRepository,
    private readonly tasks: TaskRepository = taskRepository,
    private readonly projects: ProjectRepository = projectRepository,
    private readonly dependencies: TaskDependencyRepository = taskDependencyRepository,
    private readonly audit: AuditService = defaultAuditService,
  ) {}

  async captureBaseline(
    orgId: string,
    projectId: string,
    userId: string,
    name?: string,
  ): Promise<ScheduleBaseline> {
    const project = await this.projects.findById(orgId, projectId);
    if (!project) throw new NotFoundError("Project not found");
    const tasks = await this.tasks.findByProject(orgId, projectId);
    const taskSnapshots: Snapshot[] = tasks.map((task) => ({
      taskId: task.id,
      name: task.name,
      plannedStartDate: task.plannedStartDate?.toISOString() ?? null,
      plannedEndDate: task.plannedEndDate?.toISOString() ?? null,
      durationDays: task.durationDays,
    }));
    const baselineData = {
      projectId,
      orgId,
      name: name?.trim() || "Original Baseline",
      capturedById: userId,
      taskSnapshots: taskSnapshots as unknown as Prisma.InputJsonValue,
    };
    const existing = await this.baselines.findByProject(orgId, projectId);
    const baseline = existing
      ? await this.baselines.replace(projectId, baselineData)
      : await this.baselines.capture(baselineData);
    await this.audit.log({
      orgId,
      userId,
      action: TASK_AUDIT_ACTIONS.SCHEDULE_BASELINE_CAPTURED,
      entity: "schedule_baseline",
      entityId: baseline.id,
      newValue: { projectId, name: baseline.name, taskCount: taskSnapshots.length },
    });
    return baseline;
  }

  async getBaseline(orgId: string, projectId: string): Promise<ScheduleBaseline | null> {
    const project = await this.projects.findById(orgId, projectId);
    if (!project) throw new NotFoundError("Project not found");
    return this.baselines.findByProject(orgId, projectId);
  }

  async getScheduleVariance(orgId: string, projectId: string): Promise<ScheduleVariance> {
    const project = await this.projects.findById(orgId, projectId);
    if (!project) throw new NotFoundError("Project not found");
    const [baseline, tasks] = await Promise.all([
      this.baselines.findByProject(orgId, projectId),
      this.tasks.findByProject(orgId, projectId),
    ]);
    const snapshots = new Map(
      readSnapshots(baseline?.taskSnapshots).map((snapshot) => [snapshot.taskId, snapshot]),
    );
    const varianceTasks = tasks.map((task) => {
      const snapshot = snapshots.get(task.id);
      const baselineDays = snapshot ? snapshotDays(snapshot) : null;
      const currentDays = taskDays(task);
      const varianceDays = calcVarianceDays(baselineDays, currentDays);
      return {
        taskId: task.id,
        name: task.name,
        baselineDays,
        currentDays,
        varianceDays,
        isDelayed: varianceDays !== null && varianceDays > 0,
      };
    });
    const numbers = varianceTasks
      .map((task) => task.varianceDays)
      .filter((value): value is number => value !== null);
    const nodes: TaskNode[] = tasks.map((task) => ({
      id: task.id,
      plannedStartDate: task.plannedStartDate,
      plannedEndDate: task.plannedEndDate,
      durationDays: task.durationDays,
      predecessors: [],
    }));
    const overrun = project.plannedEndDate
      ? findOverrunTasks(nodes, project.plannedEndDate)
      : [];
    const delayed = varianceTasks.filter((task) => task.isDelayed).map((task) => task.taskId);
    return {
      tasks: varianceTasks,
      overallVarianceDays: numbers.length ? Math.max(...numbers) : 0,
      tasksAtRisk: [...new Set([...delayed, ...overrun])],
    };
  }

  async getImpactedTasks(
    orgId: string,
    projectId: string,
    taskId: string,
  ): Promise<Array<{ taskId: string; path: string[] }>> {
    const task = await this.tasks.findById(orgId, taskId);
    if (!task || task.projectId !== projectId) throw new NotFoundError("Task not found");
    const dependencies = await this.dependencies.findByProject(orgId, projectId);
    const successors = new Map<string, string[]>();
    for (const dependency of dependencies) {
      const list = successors.get(dependency.predecessorId) ?? [];
      list.push(dependency.successorId);
      successors.set(dependency.predecessorId, list);
    }
    const result: Array<{ taskId: string; path: string[] }> = [];
    const queue: Array<{ id: string; path: string[] }> = [
      { id: taskId, path: [taskId] },
    ];
    const visited = new Set([taskId]);
    while (queue.length) {
      const current = queue.shift()!;
      for (const successorId of successors.get(current.id) ?? []) {
        if (visited.has(successorId)) continue;
        visited.add(successorId);
        const path = [...current.path, successorId];
        result.push({ taskId: successorId, path });
        queue.push({ id: successorId, path });
      }
    }
    return result;
  }

  async getCriticalPath(
    orgId: string,
    projectId: string,
  ): Promise<{ criticalPath: string[]; totalDays: number; tasks: TaskNode[] }> {
    const project = await this.projects.findById(orgId, projectId);
    if (!project) throw new NotFoundError("Project not found");
    const [tasks, dependencies] = await Promise.all([
      this.tasks.findByProject(orgId, projectId),
      this.dependencies.findByProject(orgId, projectId),
    ]);
    const predecessors = new Map<string, TaskNode["predecessors"]>();
    for (const dependency of dependencies) {
      const list = predecessors.get(dependency.successorId) ?? [];
      list.push({
        id: dependency.predecessorId,
        type: dependency.type,
        lagDays: dependency.lagDays,
      });
      predecessors.set(dependency.successorId, list);
    }
    return calculateCriticalPath(
      tasks.map((task) => ({
        id: task.id,
        plannedStartDate: task.plannedStartDate,
        plannedEndDate: task.plannedEndDate,
        durationDays: task.durationDays,
        predecessors: predecessors.get(task.id) ?? [],
      })),
    );
  }
}

export const scheduleService = new ScheduleService();
