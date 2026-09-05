import { Queue, Worker, type Processor, type ConnectionOptions } from "bullmq";
import { env } from "../../config/index.js";

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
 * client.
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
  return new Worker<T, R, N>(name, processor, { connection });
}

export { createQueue, createWorker };
