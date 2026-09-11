import type { JobsOptions, Job } from "bullmq";
import { createQueue } from "./index.js";
import { getIdempotentJobId, releaseIdempotencyKey, reserveIdempotencyKey, writeJobState } from "./jobState.js";

export async function enqueueJob<T>(
  queueName: string,
  jobName: string,
  data: T & { orgId?: string },
  idempotencyKey: string,
  options: JobsOptions = {},
): Promise<Job<T>> {
  const jobId = `job:${idempotencyKey}`;
  const reserved = await reserveIdempotencyKey(queueName, idempotencyKey, jobId);
  if (!reserved) {
    const existingId = await getIdempotentJobId(queueName, idempotencyKey);
    const queue = createQueue(queueName);
    try {
      const existingJob = existingId ? (await queue.getJob(existingId)) as Job<T> | undefined : undefined;
      if (existingJob) return existingJob;
      throw new Error(`Idempotency key is reserved but its job is unavailable: ${idempotencyKey}`);
    } finally {
      await queue.close();
    }
  }

  const queue = createQueue(queueName);
  let job: Job<T>;
  try {
    job = await queue.add(jobName, data, { ...options, jobId }) as Job<T>;
  } catch (error) {
    await releaseIdempotencyKey(queueName, idempotencyKey, jobId);
    throw error;
  } finally {
    await queue.close();
  }

  await writeJobState({
    queue: queueName,
    jobId: job.id ?? jobId,
    jobName,
    status: "queued",
    attempts: 0,
    ...(data.orgId ? { orgId: data.orgId } : {}),
    updatedAt: new Date().toISOString(),
  });
  return job;
}
