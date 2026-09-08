import type { TaskStatus } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import { cacheGet, cacheSet, cacheDel, cacheKey, CACHE_TTL } from "../../infrastructure/redis/cache.js";
import { NotFoundError } from "../../common/index.js";
import { scheduleService } from "../scheduling/schedule.service.js";
import type { PhaseMetrics, ScheduleMetrics } from "./schedule-metrics.types.js";

export class ScheduleMetricsService {
  async getScheduleMetrics(orgId: string, projectId: string): Promise<ScheduleMetrics> {
    const cached = await cacheGet<ScheduleMetrics>(cacheKey.scheduleMetrics(projectId));
    if (cached) return cached;

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, orgId: true, plannedEndDate: true },
    });
    if (!project || project.orgId !== orgId) {
      throw new NotFoundError("Project not found");
    }

    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Parallel queries + reuse existing schedule service calculations
    const [tasks, milestones, phases, variance, criticalPath] = await Promise.all([
      db.task.findMany({
        where: { projectId, orgId },
        select: {
          id: true,
          status: true,
          progress: true,
          plannedEndDate: true,
          phaseId: true,
        },
      }),
      db.milestone.findMany({
        where: { projectId },
        select: { id: true, name: true, dueDate: true, status: true },
        orderBy: { dueDate: "asc" },
      }),
      db.projectPhase.findMany({
        where: { projectId, orgId },
        select: { id: true, name: true },
        orderBy: { order: "asc" },
      }),
      scheduleService.getScheduleVariance(orgId, projectId),
      scheduleService.getCriticalPath(orgId, projectId),
    ]);

    // ── Task metrics ─────────────────────────────────────────────────────────
    const activeTasks = tasks.filter((t) => t.status !== "CANCELLED");
    const total = activeTasks.length;
    const completed = activeTasks.filter((t) => t.status === "DONE").length;
    const overdue = activeTasks.filter(
      (t) =>
        t.plannedEndDate !== null &&
        t.plannedEndDate < now &&
        t.status !== "DONE",
    ).length;

    const completionPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const progressValues = activeTasks.map((t) => t.progress);
    const avgProgress =
      progressValues.length > 0
        ? Math.round(progressValues.reduce((a, b) => a + b, 0) / progressValues.length)
        : 0;

    // Build byStatus from all task statuses
    const ALL_STATUSES: TaskStatus[] = [
      "TODO",
      "IN_PROGRESS",
      "BLOCKED",
      "DONE",
      "CANCELLED",
    ];
    const byStatus = ALL_STATUSES.reduce(
      (acc, s) => {
        acc[s] = tasks.filter((t) => t.status === s).length;
        return acc;
      },
      {} as Record<TaskStatus, number>,
    );

    // ── Milestone metrics ─────────────────────────────────────────────────────
    const completedMilestones = milestones.filter((m) => m.status === "COMPLETED").length;
    const missedMilestones = milestones.filter(
      (m) => m.dueDate < now && m.status !== "COMPLETED",
    ).length;
    const upcomingMilestones = milestones
      .filter((m) => m.dueDate >= now && m.dueDate <= in30Days && m.status !== "COMPLETED")
      .slice(0, 10)
      .map((m) => ({
        id: m.id,
        name: m.name,
        dueDate: m.dueDate.toISOString(),
        status: m.status,
      }));

    // ── Phase metrics ─────────────────────────────────────────────────────────
    const phaseMetrics: PhaseMetrics[] = phases.map((phase) => {
      const phaseTasks = activeTasks.filter((t) => t.phaseId === phase.id);
      const phaseCompleted = phaseTasks.filter((t) => t.status === "DONE").length;
      const hasOverdueTasks = phaseTasks.some(
        (t) => t.plannedEndDate !== null && t.plannedEndDate < now && t.status !== "DONE",
      );
      return {
        phaseId: phase.id,
        name: phase.name,
        taskCount: phaseTasks.length,
        completedCount: phaseCompleted,
        completionPercent:
          phaseTasks.length > 0
            ? Math.round((phaseCompleted / phaseTasks.length) * 100)
            : 0,
        hasOverdueTasks,
      };
    });

    const metrics: ScheduleMetrics = {
      projectId,
      computedAt: now.toISOString(),
      tasks: {
        total,
        byStatus,
        overdue,
        completionPercent,
        avgProgress,
        scheduleVarianceDays: variance.overallVarianceDays,
        tasksAtRisk: variance.tasksAtRisk,
        criticalPathLength: criticalPath.totalDays,
      },
      milestones: {
        total: milestones.length,
        completed: completedMilestones,
        missed: missedMilestones,
        upcoming: upcomingMilestones,
      },
      phases: phaseMetrics,
    };

    await cacheSet(cacheKey.scheduleMetrics(projectId), metrics, CACHE_TTL.REPORT_PROJECT);
    return metrics;
  }

  async invalidate(projectId: string): Promise<void> {
    await cacheDel(cacheKey.scheduleMetrics(projectId));
  }
}

export const scheduleMetricsService = new ScheduleMetricsService();
