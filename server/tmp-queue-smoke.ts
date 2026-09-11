import { createWorker, createQueue } from "./src/infrastructure/queue/index.js";
import { enqueueJob } from "./src/infrastructure/queue/producer.js";
import { readJobState } from "./src/infrastructure/queue/jobState.js";
import { getQueueMetrics } from "./src/infrastructure/queue/status.js";
import { listDeadLetters } from "./src/infrastructure/queue/deadLetter.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForState(queueName: string, jobId: string, expected: string, timeoutMs = 10_000) {
  const queue = createQueue(queueName);
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const job = await queue.getJob(jobId);
      if (job && (await job.getState()) === expected) return job;
      await sleep(100);
    }
  } finally {
    await queue.close();
  }
  throw new Error(`Timed out waiting for ${queueName}/${jobId} to become ${expected}`);
}

const queueName = "smoke-queue";
const failingQueueName = "smoke-failing";
const timeoutQueueName = "smoke-timeout";
const workers = [];

try {
  const successWorker = createWorker(queueName, async () => "ok");
  const failingWorker = createWorker(failingQueueName, async () => {
    throw new Error("intentional smoke failure");
  });
  const timeoutWorker = createWorker(timeoutQueueName, async () => {
    await sleep(500);
    return "too late";
  });
  workers.push(successWorker, failingWorker, timeoutWorker);

  const first = await enqueueJob(queueName, "SMOKE_SUCCESS", { orgId: "org-smoke" }, "success-1", {
    attempts: 2,
  });
  const duplicate = await enqueueJob(queueName, "SMOKE_SUCCESS", { orgId: "org-smoke" }, "success-1", {
    attempts: 2,
  });
  if (first.id !== duplicate.id) throw new Error("Idempotency did not return the original job");
  await waitForState(queueName, first.id!, "completed");
  const state = await readJobState(queueName, first.id!);
  if (state?.status !== "completed") throw new Error("Completed job state was not persisted");

  const failing = await enqueueJob(failingQueueName, "SMOKE_FAIL", { orgId: "org-smoke" }, "failure-1", {
    attempts: 2,
  });
  await waitForState(failingQueueName, failing.id!, "failed");
  await sleep(500);
  const deadLetters = await listDeadLetters(failingQueueName);
  if (!deadLetters.some((job) => job.data.originalJobId === failing.id)) {
    throw new Error("Failed job was not routed to the dead-letter queue");
  }

  const timeout = await enqueueJob(timeoutQueueName, "SMOKE_TIMEOUT", { orgId: "org-smoke" }, "timeout-1", {
    attempts: 1,
  });
  await waitForState(timeoutQueueName, timeout.id!, "failed");
  const timeoutState = await readJobState(timeoutQueueName, timeout.id!);
  if (!timeoutState?.error?.includes("timed out")) throw new Error("Timeout was not recorded");

  const metrics = await getQueueMetrics();
  if (!metrics.some((entry) => entry.queue === "email")) throw new Error("Queue taxonomy metrics are incomplete");

  console.log(JSON.stringify({
    redis: process.env.REDIS_URL,
    checks: ["connectivity", "completion", "idempotency", "retry", "timeout", "dead-letter", "metrics"],
    successJobId: first.id,
    failureJobId: failing.id,
    timeoutJobId: timeout.id,
    deadLetterCount: deadLetters.length,
  }));
} finally {
  await Promise.all(workers.map((worker) => worker.close()));
  for (const name of [queueName, failingQueueName, timeoutQueueName]) {
    await createQueue(name).obliterate({ force: true }).catch(() => undefined);
  }
}
