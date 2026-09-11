import { createQueue } from "./index.js";
import { ALL_QUEUES } from "./jobs.js";
import { readJobState } from "./jobState.js";

export async function getJobStatus(queueName: string, jobId: string) {
  const queue = createQueue(queueName);
  try {
    const job = await queue.getJob(jobId);
    if (!job) return readJobState(queueName, jobId);

    return {
      queue: queueName,
      jobId,
      jobName: job.name,
      status: await job.getState(),
      progress: job.progress,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 1,
      failedReason: job.failedReason || undefined,
      createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : undefined,
      processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : undefined,
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : undefined,
    };
  } finally {
    await queue.close();
  }
}

export async function getQueueMetrics() {
  const entries = await Promise.all(
    ALL_QUEUES.map(async (name) => {
      const queue = createQueue(name);
      try {
        const counts = await queue.getJobCounts("waiting", "active", "delayed", "completed", "failed");
        return { queue: name, ...counts };
      } finally {
        await queue.close();
      }
    }),
  );
  return entries;
}
