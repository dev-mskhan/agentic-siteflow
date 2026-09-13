// ⚠️  OTEL MUST be imported first — before any other module.
import "./infrastructure/observability/tracer.js";

import { startDocumentWorker } from "./modules/documents/document.worker.js";
import { startComplianceWorker } from "./modules/compliance/compliance.worker.js";
import { startCommunicationWorker } from "./modules/project-communications/communication.worker.js";
import { startCommercialWorker } from "./modules/commercial/commercial.worker.js";
import { startTaskWorker } from "./modules/scheduling/task.worker.js";
import { startNotificationWorker } from "./modules/notifications/notification.worker.js";
import { logger } from "./infrastructure/logger.js";
import { setWorkersFailed, setWorkersReady, setWorkersStarting, setWorkersStopped } from "./infrastructure/queue/runtime.js";

let workers: { close: () => Promise<void> }[] = [];

export function startAllWorkers() {
  setWorkersStarting();
  const startedWorkers: { close: () => Promise<void> }[] = [];
  try {
    const docWorker = startDocumentWorker();
    startedWorkers.push(docWorker);
    const compWorker = startComplianceWorker();
    startedWorkers.push(compWorker);
    const commWorker = startCommunicationWorker();
    startedWorkers.push(commWorker);
    const commlWorker = startCommercialWorker();
    startedWorkers.push(commlWorker);
    const taskWorker = startTaskWorker();
    startedWorkers.push(taskWorker);
    const notificationWorker = startNotificationWorker();
    startedWorkers.push(notificationWorker);
    workers = [docWorker, compWorker, commWorker, commlWorker, taskWorker, notificationWorker];
    setWorkersReady(workers.length);
    logger.info("Background workers started successfully (docs, compliance, comms, commercial, tasks, notifications)");
  } catch (err) {
    workers = [];
    void Promise.all(
      startedWorkers.map((worker) =>
        worker.close().catch((closeErr: unknown) => {
          logger.warn({ err: closeErr }, "Error closing partially initialized worker");
        }),
      ),
    );
    setWorkersFailed(err);
    logger.error({ err }, "Failed to initialize background workers");
  }
}

export async function stopAllWorkers() {
  for (const worker of workers) {
    try {
      await worker.close();
    } catch (err) {
      logger.warn({ err }, "Error closing worker");
    }
  }
  workers = [];
  setWorkersStopped();
}
