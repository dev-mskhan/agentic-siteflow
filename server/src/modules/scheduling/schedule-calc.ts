export interface TaskNode {
  id: string;
  plannedStartDate: Date | null;
  plannedEndDate: Date | null;
  durationDays: number | null;
  predecessors: Array<{ id: string; type: string; lagDays: number }>;
}

export interface CriticalPathResult {
  criticalPath: string[];
  totalDays: number;
  tasks: TaskNode[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Calculate the earliest possible start date based on completed predecessors. */
export function calcEarliestStart(
  task: TaskNode,
  completedPredecessors: Array<{ id: string; endDate: Date | null }>,
): Date | null {
  if (task.predecessors.some((predecessor) => {
    const completion = completedPredecessors.find((item) => item.id === predecessor.id);
    return !completion || !completion.endDate;
  })) {
    return null;
  }

  const predecessorStarts = task.predecessors
    .map((predecessor) => {
      const completion = completedPredecessors.find((item) => item.id === predecessor.id);
      return completion?.endDate
        ? addDays(completion.endDate, predecessor.lagDays)
        : null;
    })
    .filter((date): date is Date => date !== null);
  const dates = [...predecessorStarts, ...(task.plannedStartDate ? [task.plannedStartDate] : [])];
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

/** Positive values mean the current schedule has more days than its baseline. */
export function calcVarianceDays(
  baselineDays: number | null,
  currentDays: number | null,
): number | null {
  if (baselineDays === null || currentDays === null) return null;
  return currentDays - baselineDays;
}

/** Return task IDs whose planned end is later than the project end date. */
export function findOverrunTasks(tasks: TaskNode[], projectEndDate: Date): string[] {
  return tasks
    .filter((task) => task.plannedEndDate !== null && task.plannedEndDate.getTime() > projectEndDate.getTime())
    .map((task) => task.id);
}

function taskDuration(task: TaskNode): number {
  if (task.durationDays !== null) return Math.max(0, task.durationDays);
  if (!task.plannedStartDate || !task.plannedEndDate) return 0;
  return Math.max(
    0,
    Math.round((task.plannedEndDate.getTime() - task.plannedStartDate.getTime()) / DAY_MS) + 1,
  );
}

/**
 * Finds the longest dependency chain using a topological forward pass.
 * Dependency edges are represented by each node's predecessor list.
 */
export function calculateCriticalPath(tasks: TaskNode[]): CriticalPathResult {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const successors = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const task of tasks) {
    const predecessors = task.predecessors.filter((dependency) => byId.has(dependency.id));
    indegree.set(task.id, predecessors.length);
    for (const predecessor of predecessors) {
      const next = successors.get(predecessor.id) ?? [];
      next.push(task.id);
      successors.set(predecessor.id, next);
    }
  }

  const queue = tasks.filter((task) => indegree.get(task.id) === 0).map((task) => task.id);
  const distance = new Map<string, number>();
  const paths = new Map<string, string[]>();
  for (const task of tasks) {
    distance.set(task.id, taskDuration(task));
    paths.set(task.id, [task.id]);
  }

  let processed = 0;
  while (queue.length) {
    const currentId = queue.shift()!;
    processed += 1;
    for (const successorId of successors.get(currentId) ?? []) {
      const successor = byId.get(successorId)!;
      const candidate = (distance.get(currentId) ?? 0) + taskDuration(successor);
      if (candidate > (distance.get(successorId) ?? 0)) {
        distance.set(successorId, candidate);
        paths.set(successorId, [...(paths.get(currentId) ?? [currentId]), successorId]);
      }
      const nextIndegree = (indegree.get(successorId) ?? 0) - 1;
      indegree.set(successorId, nextIndegree);
      if (nextIndegree === 0) queue.push(successorId);
    }
  }

  // A cycle should be prevented by TaskService, but avoid returning a
  // misleading result if malformed data is encountered.
  if (processed !== tasks.length) {
    throw new Error("Cannot calculate critical path for a cyclic dependency graph");
  }

  let bestId: string | undefined;
  for (const task of tasks) {
    if (bestId === undefined || (distance.get(task.id) ?? 0) > (distance.get(bestId) ?? 0)) {
      bestId = task.id;
    }
  }
  const criticalPath = bestId ? paths.get(bestId) ?? [bestId] : [];
  return {
    criticalPath,
    totalDays: bestId ? distance.get(bestId) ?? 0 : 0,
    tasks: criticalPath.flatMap((id) => {
      const task = byId.get(id);
      return task ? [task] : [];
    }),
  };
}

export const findCriticalPath = calculateCriticalPath;
