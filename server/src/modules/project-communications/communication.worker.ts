import type { Job, Worker } from "bullmq";
import { db } from "../../infrastructure/database/client.js";
import { createWorker } from "../../infrastructure/queue/index.js";
import { QUEUES, JOBS } from "../../infrastructure/queue/jobs.js";
import { auditService } from "../audit/audit.router.js";

export interface CheckOverdueCommunicationsJobData {
  orgId: string;
}

export async function processOverdueCommunicationsJob(job: Job<CheckOverdueCommunicationsJobData>) {
  const { orgId } = job.data;
  const now = new Date();

  // 1. Scan for overdue open RFIs
  const overdueRfis = await db.rfi.findMany({
    where: {
      orgId,
      status: { in: ["OPEN", "UNDER_REVIEW"] },
      dueDate: { not: null, lt: now },
    },
    select: { id: true, rfiNumber: true, title: true, dueDate: true, assignedToId: true },
  });

  for (const rfi of overdueRfis) {
    await auditService.log({
      orgId,
      userId: "system",
      action: "RfiOverdue",
      entity: "domain_event",
      entityId: rfi.id,
      newValue: {
        rfiId: rfi.id,
        rfiNumber: rfi.rfiNumber,
        title: rfi.title,
        dueDate: rfi.dueDate,
        assignedToId: rfi.assignedToId,
      },
    });
  }

  // 2. Scan for overdue open Submittals
  const overdueSubmittals = await db.submittal.findMany({
    where: {
      orgId,
      status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
      dueDate: { not: null, lt: now },
    },
    select: { id: true, submittalNumber: true, revision: true, title: true, dueDate: true, leadReviewerId: true },
  });

  for (const sub of overdueSubmittals) {
    await auditService.log({
      orgId,
      userId: "system",
      action: "SubmittalOverdue",
      entity: "domain_event",
      entityId: sub.id,
      newValue: {
        submittalId: sub.id,
        submittalNumber: sub.submittalNumber,
        revision: sub.revision,
        title: sub.title,
        dueDate: sub.dueDate,
        leadReviewerId: sub.leadReviewerId,
      },
    });
  }

  return {
    overdueRfis: overdueRfis.length,
    overdueSubmittals: overdueSubmittals.length,
  };
}

export function startCommunicationWorker(): Worker<CheckOverdueCommunicationsJobData> {
  return createWorker<CheckOverdueCommunicationsJobData>(
    QUEUES.COMMUNICATIONS,
    async (job) => {
      if (job.name === JOBS.CHECK_OVERDUE_RFIS_AND_SUBMITTALS) {
        return processOverdueCommunicationsJob(job);
      }
    },
  );
}
