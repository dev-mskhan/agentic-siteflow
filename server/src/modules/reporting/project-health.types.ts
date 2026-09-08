import type { ProjectStatus } from "@prisma/client";

export interface ProjectHealthSchedule {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  /** Tasks where plannedEndDate < today AND status not DONE/CANCELLED */
  overdueTasks: number;
  /** completedTasks / totalTasks * 100 (0 when no tasks) */
  completionPercent: number;
  /** Mean of task.progress across all non-cancelled tasks */
  avgProgress: number;
  /** 0–100 score: starts at 100, penalised 2pts per % overdue */
  scheduleHealthScore: number;
}

export interface ProjectHealthIssues {
  total: number;
  open: number;
  withCostImpact: number;
  withScheduleImpact: number;
  /** dueDate < today AND status OPEN or IN_PROGRESS */
  overdue: number;
}

export interface ProjectHealthCommunications {
  openRfis: number;
  /** dueDate < today AND status not ANSWERED/CLOSED/REJECTED */
  overdueRfis: number;
  openSubmittals: number;
  /** dueDate < today AND status SUBMITTED or UNDER_REVIEW */
  overdueSubmittals: number;
}

export interface ProjectHealthSafety {
  openIncidents: number;
  openCorrectiveActions: number;
}

export type HealthStatus = "GREEN" | "AMBER" | "RED";

export interface ProjectHealthSnapshot {
  projectId: string;
  projectName: string;
  status: ProjectStatus;
  /** ISO timestamp when this snapshot was computed */
  computedAt: string;
  schedule: ProjectHealthSchedule;
  issues: ProjectHealthIssues;
  communications: ProjectHealthCommunications;
  safety: ProjectHealthSafety;
  /**
   * Weighted composite: 40% schedule + 40% cost-proxy + 20% issues.
   * Cost proxy = 100 if no over-budget cost codes are known (cost metrics
   * are computed separately), otherwise it uses the issue/RFI signal.
   */
  overallHealthScore: number;
  healthStatus: HealthStatus;
}
