import { db } from "../../infrastructure/database/client.js";
import {
  cacheGet,
  cacheSet,
  cacheDel,
  cacheKey,
  CACHE_TTL,
} from "../../infrastructure/redis/cache.js";
import { NotFoundError } from "../../common/index.js";
import { projectHealthService } from "./project-health.service.js";
import { scheduleMetricsService } from "./schedule-metrics.service.js";
import { costMetricsService } from "./cost-metrics.service.js";
import { procurementMetricsService } from "./procurement-metrics.service.js";
import { subcontractorMetricsService } from "./subcontractor-metrics.service.js";
import type {
  OrgExecutiveDashboard,
  OrgProjectSummary,
  OrgSummary,
  ProjectFullReport,
} from "./executive-report.types.js";
import { logger } from "../../infrastructure/logger.js";

export class ExecutiveReportService {
  /**
   * Get the combined full report for a single project.
   *
   * Runs all five sub-reports in parallel. The result is cached
   * as a whole so subsequent calls (e.g. dashboard + detail) don't
   * re-query the individual sub-reports.
   */
  async getProjectFullReport(orgId: string, projectId: string): Promise<ProjectFullReport> {
    const cached = await cacheGet<ProjectFullReport>(cacheKey.projectFullReport(projectId));
    if (cached) return cached;

    // Verify the project exists before kicking off fan-out
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, orgId: true },
    });
    if (!project || project.orgId !== orgId) {
      throw new NotFoundError("Project not found");
    }

    // All five sub-reports in parallel — each is individually cached too
    const [health, schedule, cost, procurement, subcontractors] = await Promise.all([
      projectHealthService.getProjectHealthSnapshot(orgId, projectId),
      scheduleMetricsService.getScheduleMetrics(orgId, projectId),
      costMetricsService.getCostMetrics(orgId, projectId),
      procurementMetricsService.getProcurementMetrics(orgId, projectId),
      subcontractorMetricsService.getSubcontractorMetrics(orgId, projectId),
    ]);

    const report: ProjectFullReport = {
      projectId,
      computedAt: new Date().toISOString(),
      health,
      schedule,
      cost,
      procurement,
      subcontractors,
    };

    await cacheSet(cacheKey.projectFullReport(projectId), report, CACHE_TTL.REPORT_ORG);
    return report;
  }

  /**
   * Get the org-level executive dashboard.
   *
   * Iterates all ACTIVE projects, runs health + cost + schedule metrics per project
   * in parallel, and aggregates into a single overview.
   *
   * Uses per-project health/cost caches — only uncached projects actually hit the DB.
   */
  async getOrgExecutiveDashboard(orgId: string): Promise<OrgExecutiveDashboard> {
    const cached = await cacheGet<OrgExecutiveDashboard>(cacheKey.orgDashboard(orgId));
    if (cached) return cached;

    const activeProjects = await db.project.findMany({
      where: { orgId, status: "ACTIVE" },
      select: { id: true, name: true, status: true },
      orderBy: { createdAt: "asc" },
    });

    // Fan-out: compute health, cost, and schedule for every active project in parallel.
    // Errors for individual projects are caught and skipped so one bad project
    // doesn't abort the entire dashboard.
    const projectRows = await Promise.all(
      activeProjects.map(async (project): Promise<OrgProjectSummary | null> => {
        try {
          const [health, cost, schedule] = await Promise.all([
            projectHealthService.getProjectHealthSnapshot(orgId, project.id),
            costMetricsService.getCostMetrics(orgId, project.id),
            scheduleMetricsService.getScheduleMetrics(orgId, project.id),
          ]);

          return {
            projectId: project.id,
            projectName: project.name,
            status: project.status,
            healthStatus: health.healthStatus,
            overallHealthScore: health.overallHealthScore,
            revisedBudget: cost.budget.revised,
            forecastCost: cost.budget.forecast,
            budgetVariance: cost.budget.variance,
            isOverBudget: cost.budget.isOverBudget,
            scheduleVarianceDays: schedule.tasks.scheduleVarianceDays,
            overdueTasksCount: schedule.tasks.overdue,
            completionPercent: schedule.tasks.completionPercent,
            openIssuesCount: health.issues.open,
            openRfisCount: health.communications.openRfis,
          };
        } catch (err) {
          logger.warn(
            { err, projectId: project.id },
            "Executive dashboard: failed to compute metrics for project, skipping",
          );
          return null;
        }
      }),
    );

    const projects = projectRows.filter((r): r is OrgProjectSummary => r !== null);

    const summary: OrgSummary = {
      totalRevisedBudget: projects.reduce((s, p) => s + p.revisedBudget, 0),
      totalForecastCost: projects.reduce((s, p) => s + p.forecastCost, 0),
      totalActualCost: 0, // computed below
      overBudgetProjectsCount: projects.filter((p) => p.isOverBudget).length,
      redProjectsCount: projects.filter((p) => p.healthStatus === "RED").length,
      amberProjectsCount: projects.filter((p) => p.healthStatus === "AMBER").length,
      greenProjectsCount: projects.filter((p) => p.healthStatus === "GREEN").length,
    };

    // totalActualCost requires a separate pass since it's in costMetrics, not projectRow
    // We already have cost metrics cached, so re-fetch is instant
    let totalActualCost = 0;
    for (const p of projects) {
      try {
        const cost = await costMetricsService.getCostMetrics(orgId, p.projectId);
        totalActualCost += cost.budget.actual;
      } catch {
        // skip
      }
    }
    summary.totalActualCost = totalActualCost;

    const dashboard: OrgExecutiveDashboard = {
      orgId,
      computedAt: new Date().toISOString(),
      activeProjectsCount: projects.length,
      projects,
      summary,
    };

    await cacheSet(cacheKey.orgDashboard(orgId), dashboard, CACHE_TTL.REPORT_ORG);
    return dashboard;
  }

  /** Invalidate the org dashboard and the full project report cache. */
  async invalidateProject(projectId: string, orgId: string): Promise<void> {
    await cacheDel(
      cacheKey.projectFullReport(projectId),
      cacheKey.orgDashboard(orgId),
    );
  }
}

export const executiveReportService = new ExecutiveReportService();
