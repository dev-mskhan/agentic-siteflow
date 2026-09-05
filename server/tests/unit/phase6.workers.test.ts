import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import { processDocumentJob } from "../../src/modules/documents/document.worker.js";
import { processComplianceExpirationJob } from "../../src/modules/compliance/compliance.worker.js";
import { processOverdueCommunicationsJob } from "../../src/modules/project-communications/communication.worker.js";
import { storageService } from "../../src/infrastructure/storage/index.js";
import { documentRepository } from "../../src/modules/documents/document.repository.js";
import { complianceService } from "../../src/modules/compliance/compliance.service.js";
import { db } from "../../src/infrastructure/database/client.js";
import { auditService } from "../../src/modules/audit/audit.router.js";

vi.mock("../../src/infrastructure/storage/index.js", () => ({
  storageService: {
    download: vi.fn(),
  },
}));

vi.mock("../../src/modules/documents/document.repository.js", () => ({
  documentRepository: {
    updateVersionChecksum: vi.fn(),
  },
}));

vi.mock("../../src/modules/compliance/compliance.service.js", () => ({
  complianceService: {
    checkAndAlertExpiringRecords: vi.fn(),
  },
}));

vi.mock("../../src/infrastructure/database/client.js", () => ({
  db: {
    rfi: {
      findMany: vi.fn(),
    },
    submittal: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../../src/modules/audit/audit.router.js", () => ({
  auditService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("Phase 6 Background Workers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("processDocumentJob", () => {
    it("downloads file, computes sha256 checksum, and updates document version", async () => {
      const fileContent = Buffer.from("test document content for checksum calculation");
      vi.mocked(storageService.download).mockResolvedValue(fileContent);
      vi.mocked(documentRepository.updateVersionChecksum).mockResolvedValue({} as never);

      const job = {
        data: {
          orgId: "org_1",
          documentId: "doc_1",
          versionNumber: 1,
          storageKey: "documents/doc_1/v1.pdf",
          storageBucket: "siteflow-documents",
        },
      } as Job;

      const result = await processDocumentJob(job as never);

      expect(storageService.download).toHaveBeenCalledWith("siteflow-documents", "documents/doc_1/v1.pdf");
      expect(documentRepository.updateVersionChecksum).toHaveBeenCalledWith(
        "doc_1",
        1,
        expect.any(String),
      );
      expect(result.checksum).toBeDefined();
      expect(result.checksum).toHaveLength(64); // SHA-256 hex string length
    });
  });

  describe("processComplianceExpirationJob", () => {
    it("delegates to complianceService.checkAndAlertExpiringRecords", async () => {
      vi.mocked(complianceService.checkAndAlertExpiringRecords).mockResolvedValue({
        scanned: 5,
        alerted: 2,
        expired: 1,
      });

      const job = {
        data: {
          orgId: "org_1",
          windowDays: 45,
        },
      } as Job;

      const result = await processComplianceExpirationJob(job as never);

      expect(complianceService.checkAndAlertExpiringRecords).toHaveBeenCalledWith("org_1", 45);
      expect(result).toEqual({ scanned: 5, alerted: 2, expired: 1 });
    });
  });

  describe("processOverdueCommunicationsJob", () => {
    it("finds overdue RFIs and Submittals and logs domain events", async () => {
      vi.mocked(db.rfi.findMany).mockResolvedValue([
        {
          id: "rfi_1",
          rfiNumber: "RFI-001",
          title: "Concrete mix query",
          dueDate: new Date("2026-08-01"),
          assignedToId: "user_1",
        },
      ] as never);

      vi.mocked(db.submittal.findMany).mockResolvedValue([
        {
          id: "sub_1",
          submittalNumber: "SUB-001",
          revision: 0,
          title: "Rebar submittal",
          dueDate: new Date("2026-08-05"),
          leadReviewerId: "user_2",
        },
      ] as never);

      const job = {
        data: {
          orgId: "org_1",
        },
      } as Job;

      const result = await processOverdueCommunicationsJob(job as never);

      expect(result).toEqual({ overdueRfis: 1, overdueSubmittals: 1 });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "RfiOverdue",
          entity: "domain_event",
          entityId: "rfi_1",
        }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SubmittalOverdue",
          entity: "domain_event",
          entityId: "sub_1",
        }),
      );
    });
  });
});
