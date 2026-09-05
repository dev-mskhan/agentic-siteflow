import crypto from "node:crypto";
import type { Job, Worker } from "bullmq";
import { createWorker } from "../../infrastructure/queue/index.js";
import { QUEUES, JOBS } from "../../infrastructure/queue/jobs.js";
import { storageService } from "../../infrastructure/storage/index.js";
import { documentRepository } from "./document.repository.js";

export interface DocumentProcessJobData {
  orgId: string;
  documentId: string;
  versionNumber: number;
  storageKey: string;
  storageBucket: string;
}

export async function processDocumentJob(job: Job<DocumentProcessJobData>) {
  const { documentId, versionNumber, storageKey, storageBucket } = job.data;

  // Retrieve file content
  const buffer = await storageService.download(storageBucket, storageKey);

  // Compute SHA-256 checksum
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

  // Update version record
  await documentRepository.updateVersionChecksum(documentId, versionNumber, checksum);

  return { documentId, versionNumber, checksum };
}

export function startDocumentWorker(): Worker<DocumentProcessJobData> {
  return createWorker<DocumentProcessJobData>(
    QUEUES.DOCUMENTS,
    async (job) => {
      if (job.name === JOBS.DOCUMENT_PROCESS) {
        return processDocumentJob(job);
      }
    },
  );
}
