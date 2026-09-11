export type WorkerRuntimeStatus = "starting" | "ready" | "failed" | "stopped";

let status: WorkerRuntimeStatus = "stopped";
let registeredWorkers = 0;
let lastError: string | undefined;
let schedulerReady = false;

export function setWorkersStarting(): void {
  status = "starting";
  lastError = undefined;
}

export function setWorkersReady(count: number): void {
  status = "ready";
  registeredWorkers = count;
  lastError = undefined;
}

export function setWorkersFailed(error: unknown): void {
  status = "failed";
  lastError = error instanceof Error ? error.message : String(error);
}

export function setWorkersStopped(): void {
  status = "stopped";
  registeredWorkers = 0;
}

export function setSchedulerReady(ready: boolean): void {
  schedulerReady = ready;
}

export function getQueueRuntimeStatus() {
  return {
    workers: {
      status,
      registered: registeredWorkers,
      lastError,
    },
    scheduler: {
      status: schedulerReady ? "ready" : "unknown",
    },
  };
}
