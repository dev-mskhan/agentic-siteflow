import { Queue, Worker, type Processor, type ConnectionOptions } from "bullmq";
import { env } from "../../config/index.js";
import { canStartJob, incrementJobCount, decrementJobCount } from "./tenantJobLimit.js";

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
  return new Queue(name, { connection });
}

/**
 * Factory that creates a named BullMQ Worker connected to the shared Redis
 * client. Wraps every processor with the per-tenant job concurrency guard.
 *
 * Jobs whose `orgId` has reached the configured limit are moved to delayed
 * state (5 s backoff) rather than dropped, ensuring no work is lost.
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
        // Re-queue with backoff rather than dropping the job
        await job.moveToDelayed(Date.now() + 5_000, job.token);
        return undefined as R;
      }
      await incrementJobCount(orgId);
    }

    try {
      return await processor(job);
    } finally {
      if (orgId) {
        await decrementJobCount(orgId);
      }
    }
  };

  return new Worker<T, R, N>(name, wrappedProcessor, { connection });
}

export { createQueue, createWorker };
