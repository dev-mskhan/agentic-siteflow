import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "../../src/common/index.js";
import { ComplianceService } from "../../src/modules/compliance/compliance.service.js";
import type {
  ComplianceRepository,
  ComplianceRecordWithDetails,
} from "../../src/modules/compliance/compliance.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";

const ORG = "org_1";
const USER = "user_1";
const PROJECT_ID = "proj_1";
const COMPLIANCE_ID = "comp_1";

function makeRecord(overrides: Partial<ComplianceRecordWithDetails> = {}): ComplianceRecordWithDetails {
  return {
    id: COMPLIANCE_ID,
    orgId: ORG,
    projectId: PROJECT_ID,
    subcontractorId: null,
    complianceType: "BUILDING_PERMIT",
    title: "Commercial Building Shell Permit",
    referenceNumber: "BP-2026-9812",
    issuingAuthority: "City Department of Buildings",
    status: "ACTIVE",
    issueDate: new Date("2026-01-01"),
    expirationDate: new Date("2026-12-31"),
    reminderDays: 30,
    responsibleUserId: USER,
    notes: null,
    createdById: USER,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: { id: USER, firstName: "Admin", lastName: "User", email: "admin@example.com" },
    responsibleUser: { id: USER, firstName: "Admin", lastName: "User", email: "admin@example.com" },
    project: { id: PROJECT_ID, name: "Downtown Tower" },
    subcontractor: null,
    ...overrides,
  };
}

describe("ComplianceService", () => {
  let service: ComplianceService;
  let mockRepo: {
    findProject: ReturnType<typeof vi.fn>;
    findSubcontractor: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findExpiring: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };
  let mockAudit: { log: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockRepo = {
      findProject: vi.fn(),
      findSubcontractor: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
      findExpiring: vi.fn(),
      list: vi.fn(),
    };
    mockAudit = { log: vi.fn().mockResolvedValue(undefined) };

    service = new ComplianceService(
      mockRepo as unknown as ComplianceRepository,
      mockAudit as unknown as AuditService,
    );
  });

  describe("createComplianceRecord", () => {
    it("validates title presence and project existence", async () => {
      await expect(
        service.createComplianceRecord(ORG, USER, {
          title: "",
          complianceType: "BUILDING_PERMIT",
        }),
      ).rejects.toThrow(ValidationError);

      mockRepo.findProject.mockResolvedValue(null);
      await expect(
        service.createComplianceRecord(ORG, USER, {
          projectId: "nonexistent",
          title: "Permit",
          complianceType: "BUILDING_PERMIT",
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("auto-marks as EXPIRED if expirationDate is in the past", async () => {
      const pastDate = new Date("2020-01-01");
      const expiredRecord = makeRecord({ expirationDate: pastDate, status: "EXPIRED" });
      mockRepo.create.mockResolvedValue(expiredRecord);

      const result = await service.createComplianceRecord(ORG, USER, {
        title: "Old License",
        complianceType: "TRADE_LICENSE",
        expirationDate: pastDate,
      });

      expect(result.status).toBe("EXPIRED");
      expect(mockRepo.create).toHaveBeenCalledWith(
        ORG,
        USER,
        expect.objectContaining({ status: "EXPIRED" }),
      );
    });

    it("creates active compliance record and logs audit", async () => {
      const record = makeRecord();
      mockRepo.create.mockResolvedValue(record);

      const result = await service.createComplianceRecord(ORG, USER, {
        title: "Commercial Building Shell Permit",
        complianceType: "BUILDING_PERMIT",
        referenceNumber: "BP-2026-9812",
      });

      expect(result.id).toBe(COMPLIANCE_ID);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "COMPLIANCE_RECORD_CREATED",
          entity: "compliance_record",
          entityId: COMPLIANCE_ID,
        }),
      );
    });
  });

  describe("checkAndAlertExpiringRecords", () => {
    it("identifies soon-to-expire records and emits ComplianceRecordExpiring event", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 15); // 15 days in future

      const expiringRecord = makeRecord({ expirationDate: futureDate, status: "ACTIVE" });
      mockRepo.findExpiring.mockResolvedValue([expiringRecord]);

      const result = await service.checkAndAlertExpiringRecords(ORG, 30);

      expect(result.scanned).toBe(1);
      expect(result.alerted).toBe(1);
      expect(result.expired).toBe(0);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "ComplianceRecordExpiring",
          entity: "domain_event",
          entityId: COMPLIANCE_ID,
        }),
      );
    });

    it("marks past-date records as EXPIRED and logs COMPLIANCE_RECORD_EXPIRED", async () => {
      const pastDate = new Date("2026-01-01");
      const overdueRecord = makeRecord({ expirationDate: pastDate, status: "ACTIVE" });
      mockRepo.findExpiring.mockResolvedValue([overdueRecord]);

      const result = await service.checkAndAlertExpiringRecords(ORG, 30);

      expect(result.scanned).toBe(1);
      expect(result.expired).toBe(1);
      expect(mockRepo.update).toHaveBeenCalledWith(ORG, COMPLIANCE_ID, { status: "EXPIRED" });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "COMPLIANCE_RECORD_EXPIRED",
          entity: "compliance_record",
          entityId: COMPLIANCE_ID,
        }),
      );
    });
  });
});
