import { startDocumentWorker } from "./modules/documents/document.worker.js";
import { startComplianceWorker } from "./modules/compliance/compliance.worker.js";
import { startCommunicationWorker } from "./modules/project-communications/communication.worker.js";
import { logger } from "./infrastructure/logger.js";

let workers: { close: () => Promise<void> }[] = [];

export function startAllWorkers() {
  try {
    const docWorker = startDocumentWorker();
    const compWorker = startComplianceWorker();
    const commWorker = startCommunicationWorker();
    workers = [docWorker, compWorker, commWorker];
    logger.info("Phase 6 background workers started successfully");
  } catch (err) {
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
}
