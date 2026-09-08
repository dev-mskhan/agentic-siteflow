import type { TaskStatus } from "@prisma/client";

export interface ScheduleTaskMetrics {
  total: number;
  byStatus: Record<TaskStatus, number>;
  /** Tasks where plannedEndDate < today AND status not DONE/CANCELLED */
  overdue: number;
  completionPercent: number;
  avgProgress: number;
  /** Max variance in days across all tasks vs baseline (0 if no baseline) */
  scheduleVarianceDays: number;
  tasksAtRisk: string[];
  /** Total duration of the critical path in calendar days */
  criticalPathLength: number;
}

export interface MilestoneMetrics {
  total: number;
  completed: number;
  /** dueDate < today AND status not COMPLETED */
  missed: number;
  /** Milestones due within the next 30 days */
  upcoming: Array<{
    id: string;
    name: string;
    dueDate: string;
    status: string;
  }>;
}

export interface PhaseMetrics {
  phaseId: string;
  name: string;
  taskCount: number;
  completedCount: number;
  completionPercent: number;
  hasOverdueTasks: boolean;
}

export interface ScheduleMetrics {
  projectId: string;
  computedAt: string;
  tasks: ScheduleTaskMetrics;
  milestones: MilestoneMetrics;
  phases: PhaseMetrics[];
}
