import type { Job, Worker } from "bullmq";
import { createWorker } from "../../infrastructure/queue/index.js";
import { QUEUES, JOBS } from "../../infrastructure/queue/jobs.js";
import { complianceService } from "./compliance.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { db } from "../../infrastructure/database/client.js";
import { logger } from "../../infrastructure/logger.js";

export interface ComplianceExpirationJobData {
  orgId: string;
  windowDays?: number;
}

export async function processComplianceExpirationJob(job: Job<ComplianceExpirationJobData>) {
  const { orgId, windowDays = 30 } = job.data;

  // Handle "all" sentinel: process every active organization
  if (orgId === "all") {
    const orgs = await db.organization.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });

    let totalScanned = 0;
    let totalAlerted = 0;
    let totalExpired = 0;

    for (const org of orgs) {
      try {
        const result = await complianceService.checkAndAlertExpiringRecords(
          org.id,
          windowDays,
          notificationService,
        );
        totalScanned += result.scanned;
        totalAlerted += result.alerted;
        totalExpired += result.expired;
      } catch (err) {
        logger.error({ err, orgId: org.id }, "Compliance check failed for org");
      }
    }

    return { scanned: totalScanned, alerted: totalAlerted, expired: totalExpired };
  }

  return complianceService.checkAndAlertExpiringRecords(orgId, windowDays, notificationService);
}

export function startComplianceWorker(): Worker<ComplianceExpirationJobData> {
  return createWorker<ComplianceExpirationJobData>(
    QUEUES.COMPLIANCE,
    async (job) => {
      if (job.name === JOBS.CHECK_COMPLIANCE_EXPIRATIONS) {
        return processComplianceExpirationJob(job);
      }
    },
  );
}
