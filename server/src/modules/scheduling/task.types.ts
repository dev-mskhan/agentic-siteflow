import type {
  Task,
  TaskDependency,
  TaskHistory,
  TaskPriority,
  TaskStatus,
} from "@prisma/client";

export type TaskRecord = Task;
export type TaskHistoryRecord = TaskHistory;
export type TaskDependencyRecord = TaskDependency;
export type DependencyType = "FS" | "SS" | "FF" | "SF";

export interface CreateTaskDependencyInput {
  projectId: string;
  orgId: string;
  predecessorId: string;
  successorId: string;
  type?: DependencyType;
  lagDays?: number;
}

export interface CreateTaskInput {
  orgId: string;
  projectId: string;
  phaseId?: string;
  costCodeId?: string;
  assigneeId?: string;
  name: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  plannedStartDate?: Date;
  plannedEndDate?: Date;
  actualStartDate?: Date;
  actualEndDate?: Date;
  durationDays?: number;
  progress?: number;
  notes?: string;
  createdById: string;
}

export interface UpdateTaskInput {
  phaseId?: string | null;
  costCodeId?: string | null;
  assigneeId?: string | null;
  name?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  plannedStartDate?: Date | null;
  plannedEndDate?: Date | null;
  actualStartDate?: Date | null;
  actualEndDate?: Date | null;
  durationDays?: number | null;
  progress?: number;
  notes?: string | null;
}

export interface TaskFilters {
  status?: TaskStatus;
  phaseId?: string;
  assigneeId?: string;
  priority?: TaskPriority;
  limit?: number;
  offset?: number;
}

export interface CreateTaskHistoryInput {
  taskId: string;
  projectId: string;
  orgId: string;
  field: string;
  oldValue?: string;
  newValue?: string;
  changedById: string;
  changedAt?: Date;
}

export const TASK_AUDIT_ACTIONS = {
  TASK_CREATED: "TASK_CREATED",
  TASK_UPDATED: "TASK_UPDATED",
  TASK_STATUS_CHANGED: "TASK_STATUS_CHANGED",
  TASK_DATE_CHANGED: "TASK_DATE_CHANGED",
  TASK_DEPENDENCY_ADDED: "TASK_DEPENDENCY_ADDED",
  TASK_DEPENDENCY_REMOVED: "TASK_DEPENDENCY_REMOVED",
  SCHEDULE_BASELINE_CAPTURED: "SCHEDULE_BASELINE_CAPTURED",
  MILESTONE_CREATED: "MILESTONE_CREATED",
  MILESTONE_UPDATED: "MILESTONE_UPDATED",
  MILESTONE_ACHIEVED: "MILESTONE_ACHIEVED",
} as const;

export const TASK_DOMAIN_EVENTS = {
  TASK_COMPLETED: "TaskCompleted",
  TASK_DELAYED: "TaskDelayed",
  TASK_DATE_CHANGED: "TaskDateChanged",
} as const;

export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  TODO: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["DONE", "BLOCKED", "TODO", "CANCELLED"],
  BLOCKED: ["IN_PROGRESS", "TODO", "CANCELLED"],
  DONE: [],
  CANCELLED: [],
};
