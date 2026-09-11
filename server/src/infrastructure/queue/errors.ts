import { UnrecoverableError } from "bullmq";

export class RetryableJobError extends Error {
  readonly retryable = true;
}

export class NonRetryableJobError extends Error {
  readonly retryable = false;
}

export class JobTimeoutError extends RetryableJobError {}

export class TenantQuotaError extends RetryableJobError {}

export function toBullMQError(error: unknown): Error {
  if (error instanceof NonRetryableJobError) {
    return new UnrecoverableError(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}
