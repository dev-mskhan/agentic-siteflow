/**
 * Example worker — demonstrates the pattern for future domain workers.
 *
 * This file is NOT imported by the main server process.  Run it as a
 * separate process (e.g., `node dist/infrastructure/queue/exampleWorker.js`)
 * so workers can be scaled independently of the HTTP server.
 *
 * Graceful shutdown:
 *   - SIGINT / SIGTERM → worker.close() drains the current job and stops.
 */
import { type Job } from "bullmq";
import { logger } from "../logger.js";
import { createWorker } from "./index.js";
import { disconnectRedis } from "../redis/client.js";

interface ExampleJobData {
  message: string;
}

const QUEUE_NAME = "example";

const worker = createWorker<ExampleJobData>(
  QUEUE_NAME,
  async (job: Job<ExampleJobData>): Promise<void> => {
    logger.info({ jobId: job.id, data: job.data }, "Processing example job");
    // No-op: real workers perform async work here (e.g., await sendEmail(job.data)).
    await Promise.resolve();
  },
);

worker.on("completed", (job: Job<ExampleJobData>) => {
  logger.info({ jobId: job.id }, "Example job completed");
});

worker.on("failed", (job: Job<ExampleJobData> | undefined, err: unknown) => {
  logger.error({ jobId: job?.id, err }, "Example job failed");
});

// ── Graceful shutdown ──────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Worker shutdown signal received");

  try {
    await worker.close();
    logger.info("Worker closed");
  } catch (err: unknown) {
    logger.error({ err }, "Error closing worker");
  }

  await disconnectRedis().catch((err: unknown) => {
    logger.warn({ err }, "Error disconnecting Redis during worker shutdown");
  });

  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

logger.info({ queue: QUEUE_NAME }, "Example worker started");
