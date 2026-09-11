import { Queue, Worker, type Processor, type ConnectionOptions, type Job } from "bullmq";
import { env } from "../../config/index.js";
import { canStartJob, incrementJobCount, decrementJobCount } from "./tenantJobLimit.js";
import { getDeadLetterQueueName, getDefaultJobOptions, getQueuePolicy, getWorkerConcurrency } from "./policies.js";
import { logger } from "../logger.js";
import { writeJobState } from "./jobState.js";
import { JobTimeoutError, TenantQuotaError, toBullMQError } from "./errors.js";

/**
 * BullMQ connection options object.
 *
 * BullMQ workers and queues receive connection config options ({ host, port, password, ... })
 * rather than passing the whole instantiated ioredis client singleton.
 */
function parseRedisConnection(): ConnectionOptions {
  try {
    const url = new URL(env.REDIS_URL);
    const options: ConnectionOptions = {
      host: url.hostname || "localhost",
      port: url.port ? parseInt(url.port, 10) : 6379,
      maxRetriesPerRequest: null,
    };
    if (url.password) {
      options.password = decodeURIComponent(url.password);
    }
    if (url.username) {
      options.username = decodeURIComponent(url.username);
    }
    return options;
  } catch {
    if (env.NODE_ENV === "production") {
      throw new Error("Invalid REDIS_URL configuration");
    }
    return {
      host: "localhost",
      port: 6379,
      maxRetriesPerRequest: null,
    };
  }
}

const connection: ConnectionOptions = parseRedisConnection();

/**
 * Factory that creates a named BullMQ Queue connected to the shared Redis
 * client.  Future domain modules should use this instead of instantiating
 * Queue directly so the connection is always the singleton.
 *
 * @example
 * const notificationsQueue = createQueue("notifications");
 * await notificationsQueue.add("send-email", { userId: "123" });
 */
function createQueue(name: string): Queue {
  return new Queue(name, {
    connection,
    defaultJobOptions: getDefaultJobOptions(name),
  });
}

/**
 * Factory that creates a named BullMQ Worker connected to the shared Redis
 * client. Wraps every processor with the per-tenant job concurrency guard.
 *
 * Jobs whose `orgId` has reached the configured limit fail retryably and use
 * the queue's exponential backoff rather than being dropped.
 *
 * @example
 * const worker = createWorker("notifications", async (job) => {
 *   await sendEmail(job.data);
 * });
 */
function createWorker<T = unknown, R = unknown, N extends string = string>(
  name: string,
  processor: Processor<T, R, N>,
): Worker<T, R, N> {
  const wrappedProcessor: Processor<T, R, N> = async (job) => {
    const orgId = (job.data as Record<string, unknown>)?.orgId as string | undefined;

    if (orgId) {
      const allowed = await canStartJob(orgId);
      if (!allowed) {
        // Let BullMQ retry using the queue's exponential backoff policy.
        throw new TenantQuotaError("Tenant job concurrency limit reached");
      }
      await incrementJobCount(orgId);
    }

    try {
      try {
        return await withTimeout(processor(job), getQueuePolicy(name).timeoutMs, job);
      } catch (error) {
        throw toBullMQError(error);
      }
    } finally {
      if (orgId) {
        await decrementJobCount(orgId);
      }
    }
  };

  const worker = new Worker<T, R, N>(name, wrappedProcessor, {
    connection,
    concurrency: getWorkerConcurrency(name),
  });

  worker.on("failed", (job, err) => {
    if (!job) return;
    logger.error(
      {
        queue: name,
        jobId: job.id,
        jobName: job.name,
        attempt: job.attemptsMade,
        err,
      },
      "Background job failed",
    );
    if (job.id) {
      void writeJobState({
        queue: name,
        jobId: job.id,
        jobName: job.name,
        status: job.attemptsMade >= (job.opts.attempts ?? 1) ? "dead-lettered" : "failed",
        attempts: job.attemptsMade,
        error: err.message,
        updatedAt: new Date().toISOString(),
      }).catch((stateError: unknown) => logger.warn({ err: stateError, jobId: job.id }, "Failed to persist job state"));
    }

    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      const deadLetterQueue = createQueue(getDeadLetterQueueName(name));
      void deadLetterQueue
        .add(
          "DEAD_LETTER",
          {
            originalQueue: name,
            originalJobId: job.id,
            originalJobName: job.name,
            originalData: job.data,
            attemptsMade: job.attemptsMade,
            failedReason: err.message,
          },
          { jobId: `dead-letter:${name}:${job.id}` },
        )
        .finally(() => deadLetterQueue.close())
        .catch((dlqError: unknown) => {
          logger.error({ err: dlqError, queue: name, jobId: job.id }, "Failed to route job to dead-letter queue");
        });
    }
  });

  worker.on("completed", (job: Job<T>) => {
    logger.info(
      {
        queue: name,
        jobId: job.id,
        jobName: job.name,
        durationMs: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : undefined,
      },
      "Background job completed",
    );
    if (job.id) {
      void writeJobState({
        queue: name,
        jobId: job.id,
        jobName: job.name,
        status: "completed",
        attempts: job.attemptsMade,
        updatedAt: new Date().toISOString(),
      }).catch((stateError: unknown) => logger.warn({ err: stateError, jobId: job.id }, "Failed to persist job state"));
    }
  });

  return worker;
}

async function withTimeout<R>(promise: Promise<R>, timeoutMs: number, job: Job): Promise<R> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<R>((_, reject) => {
        timer = setTimeout(
          () => reject(new JobTimeoutError(`Job ${job.id ?? "unknown"} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export { createQueue, createWorker };
