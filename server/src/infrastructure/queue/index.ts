import { Queue, Worker, type Processor } from "bullmq";
import { redis } from "../redis/client.js";

/**
 * BullMQ connection options derived from the shared ioredis singleton.
 *
 * BullMQ accepts an ioredis instance directly via the `connection` option.
 */
const connection = redis;

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
