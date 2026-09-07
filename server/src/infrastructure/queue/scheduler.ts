import { createQueue } from "./index.js";
import { QUEUES, JOBS } from "./jobs.js";
import { logger } from "../logger.js";

/**
 * Register BullMQ repeatable cron jobs for all background worker queues.
 *
 * This function is idempotent — calling it multiple times (e.g. on server restart)
 * will not create duplicate jobs because BullMQ deduplicates by jobId.
 *
 * Cron schedule (UTC):
 *  - Compliance expiration check: 08:00 daily
 *  - Overdue invoice scan:        09:00 daily
 *  - Pending payment app reminders: 09:00 daily
 *  - Overdue RFI/Submittal check: 08:00 daily
 *
 * Workers use `orgId: "all"` as the sentinel value that tells the processor
 * to fetch all active org IDs from the database and iterate over them.
 */
export async function scheduleRecurringJobs(): Promise<void> {
  try {
    const complianceQueue = createQueue(QUEUES.COMPLIANCE);
    const commercialQueue = createQueue(QUEUES.COMMERCIAL);
    const communicationsQueue = createQueue(QUEUES.COMMUNICATIONS);

    await Promise.all([
      complianceQueue.add(
        JOBS.CHECK_COMPLIANCE_EXPIRATIONS,
        { orgId: "all" },
        {
          repeat: { pattern: "0 8 * * *" },
          jobId: `recurring:${JOBS.CHECK_COMPLIANCE_EXPIRATIONS}`,
        },
      ),
      commercialQueue.add(
        JOBS.CHECK_OVERDUE_INVOICES,
        { orgId: "all" },
        {
          repeat: { pattern: "0 9 * * *" },
          jobId: `recurring:${JOBS.CHECK_OVERDUE_INVOICES}`,
        },
      ),
      commercialQueue.add(
        JOBS.CHECK_PENDING_PAYMENT_APPLICATIONS,
        { orgId: "all" },
        {
          repeat: { pattern: "0 9 * * *" },
          jobId: `recurring:${JOBS.CHECK_PENDING_PAYMENT_APPLICATIONS}`,
        },
      ),
      communicationsQueue.add(
        JOBS.CHECK_OVERDUE_RFIS_AND_SUBMITTALS,
        { orgId: "all" },
        {
          repeat: { pattern: "0 8 * * *" },
          jobId: `recurring:${JOBS.CHECK_OVERDUE_RFIS_AND_SUBMITTALS}`,
        },
      ),
    ]);

    logger.info("Recurring background jobs scheduled successfully");
  } catch (err) {
    // Log error but do NOT throw — server should start even if Redis is temporarily unavailable
    logger.error({ err }, "Failed to schedule recurring background jobs");
  }
}
