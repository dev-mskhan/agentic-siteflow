import type { JobsOptions } from "bullmq";
import { env } from "../../config/index.js";

export interface QueuePolicy {
  attempts: number;
  backoffDelayMs: number;
  backoffJitter: number;
  timeoutMs: number;
  concurrency: number;
  tenantQuotaClass: "standard" | "high-cost";
}

const standardPolicy: QueuePolicy = {
  attempts: env.QUEUE_DEFAULT_ATTEMPTS,
  backoffDelayMs: env.QUEUE_BACKOFF_DELAY_MS,
  backoffJitter: env.QUEUE_BACKOFF_JITTER,
  timeoutMs: env.QUEUE_DEFAULT_TIMEOUT_MS,
  concurrency: env.QUEUE_DEFAULT_CONCURRENCY,
  tenantQuotaClass: "standard",
};

const highCostPolicy: QueuePolicy = {
  ...standardPolicy,
  timeoutMs: env.QUEUE_HIGH_COST_TIMEOUT_MS,
  concurrency: env.QUEUE_HIGH_COST_CONCURRENCY,
  tenantQuotaClass: "high-cost",
};

const policies: Record<string, QueuePolicy> = {
  email: standardPolicy,
  notifications: standardPolicy,
  webhooks: standardPolicy,
  reports: highCostPolicy,
  "file-processing": highCostPolicy,
  imports: highCostPolicy,
  exports: highCostPolicy,
  analytics: highCostPolicy,
  cleanup: highCostPolicy,
  "scheduled-jobs": standardPolicy,
  documents: highCostPolicy,
  compliance: standardPolicy,
  "project-communications": standardPolicy,
  commercial: standardPolicy,
  tasks: standardPolicy,
};

export function getQueuePolicy(name: string): QueuePolicy {
  return policies[name] ?? standardPolicy;
}

export function getDefaultJobOptions(name: string): JobsOptions {
  const policy = getQueuePolicy(name);
  return {
    attempts: policy.attempts,
    backoff: {
      type: "exponential",
      delay: policy.backoffDelayMs,
      jitter: policy.backoffJitter,
    },
    removeOnComplete: { age: env.QUEUE_COMPLETED_RETENTION_SECONDS },
    removeOnFail: { age: env.QUEUE_FAILED_RETENTION_SECONDS },
  };
}

export function getWorkerConcurrency(name: string): number {
  const policy = getQueuePolicy(name);
  return policy.concurrency;
}

export function getDeadLetterQueueName(name: string): string {
  return `dlq-${name}`;
}
