import type { Job, Worker } from "bullmq";
import { db } from "../../infrastructure/database/client.js";
import { createWorker } from "../../infrastructure/queue/index.js";
import { QUEUES, JOBS } from "../../infrastructure/queue/jobs.js";
import { auditService } from "../audit/audit.router.js";
import { notificationService } from "../notifications/notification.service.js";
import { logger } from "../../infrastructure/logger.js";

export interface CheckOverdueCommunicationsJobData {
  orgId: string;
}

async function processOverdueCommunicationsForOrg(orgId: string) {
  const now = new Date();

  // 1. Scan for overdue open RFIs
  const overdueRfis = await db.rfi.findMany({
    where: {
      orgId,
      status: { in: ["OPEN", "UNDER_REVIEW"] },
      dueDate: { not: null, lt: now },
    },
    select: {
      id: true,
      rfiNumber: true,
      title: true,
      dueDate: true,
      assignedToId: true,
      requestedById: true,
    },
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

    // Notify assignee if set, otherwise notify the requester
    const recipientId = rfi.assignedToId ?? rfi.requestedById;
    await notificationService.send({
      orgId,
      userId: recipientId,
      type: "RFI_OVERDUE",
      title: "RFI Overdue",
      body: `RFI ${rfi.rfiNumber}: "${rfi.title}" was due on ${rfi.dueDate?.toISOString().split("T")[0]}. Please respond or reassign.`,
      entityType: "Rfi",
      entityId: rfi.id,
      dedupeKey: `RFI_OVERDUE:${rfi.id}:${recipientId}:${rfi.dueDate?.toISOString().split("T")[0] ?? "unknown"}`,
    });
  }

  // 2. Scan for overdue open Submittals
  const overdueSubmittals = await db.submittal.findMany({
    where: {
      orgId,
      status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
      dueDate: { not: null, lt: now },
    },
    select: {
      id: true,
      submittalNumber: true,
      revision: true,
      title: true,
      dueDate: true,
      leadReviewerId: true,
      submittedById: true,
    },
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

    // Notify lead reviewer if set, otherwise notify the submitter
    const recipientId = sub.leadReviewerId ?? sub.submittedById;
    await notificationService.send({
      orgId,
      userId: recipientId,
      type: "SUBMITTAL_OVERDUE",
      title: "Submittal Review Overdue",
      body: `Submittal ${sub.submittalNumber} Rev.${sub.revision}: "${sub.title}" was due on ${sub.dueDate?.toISOString().split("T")[0]}. Please complete review.`,
      entityType: "Submittal",
      entityId: sub.id,
      dedupeKey: `SUBMITTAL_OVERDUE:${sub.id}:${recipientId}:${sub.dueDate?.toISOString().split("T")[0] ?? "unknown"}`,
    });
  }

  return {
    overdueRfis: overdueRfis.length,
    overdueSubmittals: overdueSubmittals.length,
  };
}

export async function processOverdueCommunicationsJob(job: Job<CheckOverdueCommunicationsJobData>) {
  const { orgId } = job.data;

  // Handle "all" sentinel: process every active organization
  if (orgId === "all") {
    const orgs = await db.organization.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });

    let totalRfis = 0;
    let totalSubmittals = 0;

    for (const org of orgs) {
      try {
        const result = await processOverdueCommunicationsForOrg(org.id);
        totalRfis += result.overdueRfis;
        totalSubmittals += result.overdueSubmittals;
      } catch (err) {
        logger.error({ err, orgId: org.id }, "Overdue communications check failed for org");
      }
    }

    return { overdueRfis: totalRfis, overdueSubmittals: totalSubmittals };
  }

  return processOverdueCommunicationsForOrg(orgId);
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
