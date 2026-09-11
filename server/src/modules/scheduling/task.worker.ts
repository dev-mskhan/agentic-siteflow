import type { Job, Worker } from "bullmq";
import { createWorker } from "../../infrastructure/queue/index.js";
import { QUEUES, JOBS } from "../../infrastructure/queue/jobs.js";
import { notificationService } from "../notifications/notification.service.js";
import { db } from "../../infrastructure/database/client.js";
import { logger } from "../../infrastructure/logger.js";

export interface OverdueTasksJobData {
  orgId: string;
}

/**
 * Format a Date as YYYY-MM-DD for use in notification body text.
 */
function formatDate(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

async function processOverdueTasksForOrg(orgId: string): Promise<{ notified: number }> {
  const now = new Date();

  // Find tasks that are past their planned end date and still active
  const overdueTasks = await db.task.findMany({
    where: {
      orgId,
      status: { in: ["TODO", "IN_PROGRESS"] },
      plannedEndDate: { lt: now },
      assigneeId: { not: null },
    },
    select: {
      id: true,
      name: true,
      plannedEndDate: true,
      assigneeId: true,
      orgId: true,
    },
  });

  let notified = 0;
  for (const task of overdueTasks) {
    if (!task.assigneeId) continue;
    try {
      await notificationService.send({
        orgId: task.orgId,
        userId: task.assigneeId,
        type: "TASK_OVERDUE",
        title: "Task Past Due Date",
        body: `Task "${task.name}" was due on ${formatDate(task.plannedEndDate!)}. Please update its status.`,
        entityType: "Task",
        entityId: task.id,
        dedupeKey: `TASK_OVERDUE:${task.id}:${task.assigneeId}:${formatDate(task.plannedEndDate!)}`,
      });
      notified++;
    } catch (err) {
      logger.warn({ err, taskId: task.id }, "TASK_OVERDUE notification failed");
    }
  }

  return { notified };
}

export async function processOverdueTasksJob(
  job: Job<OverdueTasksJobData>,
): Promise<{ notified: number }> {
  const { orgId } = job.data;

  if (orgId === "all") {
    const orgs = await db.organization.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });

    let total = 0;
    for (const org of orgs) {
      try {
        const result = await processOverdueTasksForOrg(org.id);
        total += result.notified;
      } catch (err) {
        logger.error({ err, orgId: org.id }, "Overdue tasks check failed for org");
      }
    }
    return { notified: total };
  }

  return processOverdueTasksForOrg(orgId);
}

export function startTaskWorker(): Worker<OverdueTasksJobData> {
  return createWorker<OverdueTasksJobData>(QUEUES.TASKS, async (job) => {
    if (job.name === JOBS.CHECK_OVERDUE_TASKS) {
      return processOverdueTasksJob(job);
    }
  });
}
