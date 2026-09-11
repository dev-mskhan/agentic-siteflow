import { createQueue } from "./index.js";
import { getDeadLetterQueueName } from "./policies.js";

export async function listDeadLetters(queueName: string, limit = 50) {
  const queue = createQueue(getDeadLetterQueueName(queueName));
  try {
    const jobs = await queue.getJobs(["waiting", "failed"], 0, Math.max(0, limit - 1), true);
    return jobs.map((job) => ({
      id: job.id,
      queue: queueName,
      name: job.name,
      data: job.data,
      timestamp: job.timestamp,
    }));
  } finally {
    await queue.close();
  }
}

export async function retryDeadLetter(queueName: string, deadLetterJobId: string): Promise<string> {
  const deadLetterQueue = createQueue(getDeadLetterQueueName(queueName));
  try {
    const deadLetter = await deadLetterQueue.getJob(deadLetterJobId);
    if (!deadLetter) throw new Error("Dead-letter job not found");

    const data = deadLetter.data as {
      originalJobId: string;
      originalJobName: string;
      originalData: unknown;
    };
    const queue = createQueue(queueName);
    try {
      const job = await queue.add(data.originalJobName, data.originalData, {
        jobId: `${data.originalJobId}:replay:${Date.now()}`,
      });
      await deadLetter.remove();
      return job.id ?? "";
    } finally {
      await queue.close();
    }
  } finally {
    await deadLetterQueue.close();
  }
}
