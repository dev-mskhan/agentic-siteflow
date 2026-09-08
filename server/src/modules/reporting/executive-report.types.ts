import type { HealthStatus } from "./project-health.types.js";
import type { ProjectHealthSnapshot } from "./project-health.types.js";
import type { ScheduleMetrics } from "./schedule-metrics.types.js";
import type { CostMetrics } from "./cost-metrics.types.js";
import type { ProcurementMetrics } from "./procurement-metrics.types.js";
import type { SubcontractorMetrics } from "./subcontractor-metrics.types.js";

/** Per-project row in the org executive dashboard */
export interface OrgProjectSummary {
  projectId: string;
  projectName: string;
  status: string;
  healthStatus: HealthStatus;
  overallHealthScore: number;
  revisedBudget: number;
  forecastCost: number;
  budgetVariance: number;
  isOverBudget: boolean;
  scheduleVarianceDays: number;
  overdueTasksCount: number;
  completionPercent: number;
  openIssuesCount: number;
  openRfisCount: number;
}

/** Org-level aggregated summary row */
export interface OrgSummary {
  totalRevisedBudget: number;
  totalForecastCost: number;
  totalActualCost: number;
  overBudgetProjectsCount: number;
  redProjectsCount: number;
  amberProjectsCount: number;
  greenProjectsCount: number;
}

/** Top-level org executive dashboard */
export interface OrgExecutiveDashboard {
  orgId: string;
  computedAt: string;
  activeProjectsCount: number;
  projects: OrgProjectSummary[];
  summary: OrgSummary;
}

/** Full combined project report — all sub-reports bundled in one call */
export interface ProjectFullReport {
  projectId: string;
  computedAt: string;
  health: ProjectHealthSnapshot;
  schedule: ScheduleMetrics;
  cost: CostMetrics;
  procurement: ProcurementMetrics;
  subcontractors: SubcontractorMetrics;
}
