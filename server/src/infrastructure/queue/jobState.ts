import { ensureRedisReady, redis } from "../redis/client.js";

const JOB_STATE_TTL_SECONDS = 7 * 24 * 60 * 60;

export type JobStateStatus = "queued" | "active" | "completed" | "failed" | "dead-lettered";

export interface JobState {
  queue: string;
  jobId: string;
  jobName: string;
  status: JobStateStatus;
  attempts: number;
  orgId?: string;
  error?: string;
  updatedAt: string;
}

function stateKey(queue: string, jobId: string): string {
  return `jobs:state:${queue}:${jobId}`;
}

function idempotencyKey(queue: string, key: string): string {
  return `jobs:idempotency:${queue}:${key}`;
}

export async function reserveIdempotencyKey(queue: string, key: string, jobId: string): Promise<boolean> {
  await ensureRedisReady();
  const result = await redis.set(idempotencyKey(queue, key), jobId, "EX", JOB_STATE_TTL_SECONDS, "NX");
  return result === "OK";
}

export async function releaseIdempotencyKey(queue: string, key: string, jobId: string): Promise<void> {
  await ensureRedisReady();
  const keyName = idempotencyKey(queue, key);
  await redis.eval(
    "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
    1,
    keyName,
    jobId,
  );
}

export async function getIdempotentJobId(queue: string, key: string): Promise<string | null> {
  await ensureRedisReady();
  return redis.get(idempotencyKey(queue, key));
}

export async function writeJobState(state: JobState): Promise<void> {
  await ensureRedisReady();
  await redis.set(stateKey(state.queue, state.jobId), JSON.stringify(state), "EX", JOB_STATE_TTL_SECONDS);
}

export async function readJobState(queue: string, jobId: string): Promise<JobState | null> {
  await ensureRedisReady();
  const raw = await redis.get(stateKey(queue, jobId));
  return raw ? (JSON.parse(raw) as JobState) : null;
}
