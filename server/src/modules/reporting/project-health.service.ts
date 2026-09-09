import { db } from "../../infrastructure/database/client.js";
import { cacheGet, cacheSet, cacheDel, cacheKey, CACHE_TTL } from "../../infrastructure/redis/cache.js";
import { NotFoundError } from "../../common/index.js";
import type {
  HealthStatus,
  ProjectHealthSnapshot,
} from "./project-health.types.js";

/**
 * Compute a 0–100 schedule health score.
 *
 * Starts at 100. Each percentage point of overdue tasks deducts 2 points.
 * e.g. 20% overdue → score 60, 50% overdue → score 0.
 */
function calcScheduleHealthScore(totalTasks: number, overdueTasks: number): number {
  if (totalTasks === 0) return 100;
  const overduePercent = (overdueTasks / totalTasks) * 100;
  return Math.max(0, Math.round(100 - overduePercent * 2));
}

/**
 * Derive overall health score (0–100) and status from sub-scores.
 *
 * Weights:
 *  - 50% schedule (score from task overdue rate)
 *  - 30% issues (penalise open issues with impact, overdue issues)
 *  - 20% communications (penalise overdue RFIs/submittals)
 */
function calcOverallHealth(
  scheduleScore: number,
  overdueTasks: number,
  totalTasks: number,
  issueOverdue: number,
  issueWithImpact: number,
  overdueRfis: number,
  overdueSubmittals: number,
): { overallHealthScore: number; healthStatus: HealthStatus } {
  // Issue score: start at 100, penalise by overdue + impactful issues
  const issuePenalty = Math.min(100, issueOverdue * 10 + issueWithImpact * 5);
  const issueScore = Math.max(0, 100 - issuePenalty);

  // Comms score
  const commsPenalty = Math.min(100, (overdueRfis + overdueSubmittals) * 8);
  const commsScore = Math.max(0, 100 - commsPenalty);

  const overallHealthScore = Math.round(
    scheduleScore * 0.5 + issueScore * 0.3 + commsScore * 0.2,
  );

  let healthStatus: HealthStatus;
  const overduePercent = totalTasks > 0 ? (overdueTasks / totalTasks) * 100 : 0;
  if (overduePercent > 40 || overallHealthScore < 40) {
    healthStatus = "RED";
  } else if (overduePercent > 20 || overallHealthScore < 70) {
    healthStatus = "AMBER";
  } else {
    healthStatus = "GREEN";
  }

  return { overallHealthScore, healthStatus };
}

export class ProjectHealthService {
  async getProjectHealthSnapshot(
    orgId: string,
    projectId: string,
  ): Promise<ProjectHealthSnapshot> {
    const cached = await cacheGet<ProjectHealthSnapshot>(cacheKey.projectHealth(projectId));
    if (cached) return cached;

    // Verify project exists and belongs to org
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, status: true, orgId: true },
    });
    if (!project || project.orgId !== orgId) {
      throw new NotFoundError("Project not found");
    }

    const now = new Date();

    // Fan-out: all 6 queries in parallel
    const [tasks, issues, rfis, submittals, safetyIncidents, safetyActions] = await Promise.all([
      db.task.findMany({
        where: { projectId, orgId },
        take: 500, // G15: cap unbounded query; large projects should use DB-level aggregation
        select: {
          status: true,
          progress: true,
          plannedEndDate: true,
        },
      }),
      db.issue.findMany({
        where: { projectId, orgId },
        take: 500, // G15: cap unbounded query
        select: {
          status: true,
          dueDate: true,
          hasCostImpact: true,
          hasScheduleImpact: true,
        },
      }),
      db.rfi.findMany({
        where: { projectId, orgId },
        take: 500, // G15: cap unbounded query
        select: { status: true, dueDate: true },
      }),
      db.submittal.findMany({
        where: { projectId, orgId },
        take: 500, // G15: cap unbounded query
        select: { status: true, dueDate: true },
      }),
      db.safetyIncident.findMany({
        where: { projectId, orgId, status: { not: "CLOSED" } },
        take: 500, // G15: cap unbounded query
        select: { id: true },
      }),
      db.safetyCorrectiveAction.findMany({
        where: { incident: { projectId, orgId }, isCompleted: false },
        take: 500, // G15: cap unbounded query
        select: { id: true },
      }),
    ]);

    // ── Schedule ──────────────────────────────────────────────────────────────
    const activeTasks = tasks.filter((t) => t.status !== "CANCELLED");
    const totalTasks = activeTasks.length;
    const completedTasks = activeTasks.filter((t) => t.status === "DONE").length;
    const inProgressTasks = activeTasks.filter((t) => t.status === "IN_PROGRESS").length;
    const overdueTasks = activeTasks.filter(
      (t) =>
        t.plannedEndDate !== null &&
        t.plannedEndDate < now &&
        t.status !== "DONE" &&
        t.status !== "CANCELLED",
    ).length;

    const completionPercent =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const progressValues = activeTasks.map((t) => t.progress);
    const avgProgress =
      progressValues.length > 0
        ? Math.round(progressValues.reduce((a, b) => a + b, 0) / progressValues.length)
        : 0;

    const scheduleHealthScore = calcScheduleHealthScore(totalTasks, overdueTasks);

    // ── Issues ────────────────────────────────────────────────────────────────
    const openIssues = issues.filter((i) => i.status === "OPEN" || i.status === "IN_PROGRESS");
    const overdueIssues = openIssues.filter(
      (i) => i.dueDate !== null && i.dueDate < now,
    ).length;
    const issuesWithCostImpact = issues.filter((i) => i.hasCostImpact).length;
    const issuesWithScheduleImpact = issues.filter((i) => i.hasScheduleImpact).length;
    const totalIssueImpact = issuesWithCostImpact + issuesWithScheduleImpact;

    // ── Communications ────────────────────────────────────────────────────────
    const CLOSED_RFI_STATUSES = new Set(["ANSWERED", "CLOSED", "REJECTED"]);
    const openRfis = rfis.filter((r) => !CLOSED_RFI_STATUSES.has(r.status)).length;
    const overdueRfis = rfis.filter(
      (r) =>
        !CLOSED_RFI_STATUSES.has(r.status) &&
        r.dueDate !== null &&
        r.dueDate < now,
    ).length;

    const OPEN_SUBMITTAL_STATUSES = new Set(["SUBMITTED", "UNDER_REVIEW"]);
    const openSubmittals = submittals.filter((s) =>
      OPEN_SUBMITTAL_STATUSES.has(s.status),
    ).length;
    const overdueSubmittals = submittals.filter(
      (s) =>
        OPEN_SUBMITTAL_STATUSES.has(s.status) &&
        s.dueDate !== null &&
        s.dueDate < now,
    ).length;

    // ── Overall health ────────────────────────────────────────────────────────
    const { overallHealthScore, healthStatus } = calcOverallHealth(
      scheduleHealthScore,
      overdueTasks,
      totalTasks,
      overdueIssues,
      totalIssueImpact,
      overdueRfis,
      overdueSubmittals,
    );

    const snapshot: ProjectHealthSnapshot = {
      projectId,
      projectName: project.name,
      status: project.status,
      computedAt: now.toISOString(),
      schedule: {
        totalTasks,
        completedTasks,
        inProgressTasks,
        overdueTasks,
        completionPercent,
        avgProgress,
        scheduleHealthScore,
      },
      issues: {
        total: issues.length,
        open: openIssues.length,
        withCostImpact: issuesWithCostImpact,
        withScheduleImpact: issuesWithScheduleImpact,
        overdue: overdueIssues,
      },
      communications: {
        openRfis,
        overdueRfis,
        openSubmittals,
        overdueSubmittals,
      },
      safety: {
        openIncidents: safetyIncidents.length,
        openCorrectiveActions: safetyActions.length,
      },
      overallHealthScore,
      healthStatus,
    };

    await cacheSet(cacheKey.projectHealth(projectId), snapshot, CACHE_TTL.REPORT_PROJECT);
    return snapshot;
  }

  /** Invalidate the project health cache. Call after any mutation that affects health. */
  async invalidate(projectId: string): Promise<void> {
    await cacheDel(cacheKey.projectHealth(projectId));
  }
}

export const projectHealthService = new ProjectHealthService();
