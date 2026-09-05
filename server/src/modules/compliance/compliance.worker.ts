import type { Job, Worker } from "bullmq";
import { createWorker } from "../../infrastructure/queue/index.js";
import { QUEUES, JOBS } from "../../infrastructure/queue/jobs.js";
import { complianceService } from "./compliance.service.js";

export interface ComplianceExpirationJobData {
  orgId: string;
  windowDays?: number;
}

export async function processComplianceExpirationJob(job: Job<ComplianceExpirationJobData>) {
  const { orgId, windowDays = 30 } = job.data;
  return complianceService.checkAndAlertExpiringRecords(orgId, windowDays);
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
