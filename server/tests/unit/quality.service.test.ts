import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "../../src/common/index.js";
import { QualityService } from "../../src/modules/quality-safety/quality.service.js";
import type {
  QualityRepository,
  QualityInspectionWithDetails,
  DeficiencyWithDetails,
} from "../../src/modules/quality-safety/quality.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";

const ORG = "org_1";
const USER = "user_1";
const PROJECT_ID = "proj_1";
const INSPECTION_ID = "insp_1";
const DEFICIENCY_ID = "def_1";

function makeInspection(overrides: Partial<QualityInspectionWithDetails> = {}): QualityInspectionWithDetails {
  return {
    id: INSPECTION_ID,
    orgId: ORG,
    projectId: PROJECT_ID,
    inspectionNumber: "QI-001",
    title: "Rebar & Formwork Pre-Pour Inspection",
    description: "Grid Line 4 to 8 Level 2 slab",
    location: "Level 2 Slab",
    status: "SCHEDULED",
    scheduledDate: new Date("2026-09-15"),
    completedDate: null,
    inspectorId: USER,
    linkedTaskId: "task_1",
    checklistItems: [
      { id: "c1", text: "Rebar clearance minimum 2 in", passed: true },
      { id: "c2", text: "Formwork clean and oiled", passed: true },
    ],
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    inspector: { id: USER, firstName: "John", lastName: "Inspector", email: "john@example.com" },
    deficiencies: [],
    ...overrides,
  };
}

function makeDeficiency(overrides: Partial<DeficiencyWithDetails> = {}): DeficiencyWithDetails {
  return {
    id: DEFICIENCY_ID,
    orgId: ORG,
    projectId: PROJECT_ID,
    inspectionId: INSPECTION_ID,
    deficiencyNumber: "DEF-001",
    title: "Rebar chair spacing too wide",
    description: "Rebar sagging between chairs at Grid Line 6",
    location: "Grid 6-B",
    severity: "MODERATE",
    status: "OPEN",
    subcontractorId: "sub_1",
    assignedToId: USER,
    dueDate: new Date("2026-09-16"),
    correctiveAction: null,
    resolvedAt: null,
    resolvedById: null,
    createdById: USER,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: { id: USER, firstName: "John", lastName: "Inspector", email: "john@example.com" },
    assignedTo: { id: USER, firstName: "John", lastName: "Inspector", email: "john@example.com" },
    resolvedBy: null,
    subcontractor: { id: "sub_1", legalName: "Steel Pros LLC", trade: "REBAR" },
    ...overrides,
  };
}

describe("QualityService", () => {
  let service: QualityService;
  let mockRepo: {
    findProject: ReturnType<typeof vi.fn>;
    findTask: ReturnType<typeof vi.fn>;
    findSubcontractor: ReturnType<typeof vi.fn>;
    getNextInspectionNumber: ReturnType<typeof vi.fn>;
    getNextDeficiencyNumber: ReturnType<typeof vi.fn>;
    createInspection: ReturnType<typeof vi.fn>;
    findInspectionById: ReturnType<typeof vi.fn>;
    recordInspectionResults: ReturnType<typeof vi.fn>;
    listInspections: ReturnType<typeof vi.fn>;
    createDeficiency: ReturnType<typeof vi.fn>;
    findDeficiencyById: ReturnType<typeof vi.fn>;
    resolveDeficiency: ReturnType<typeof vi.fn>;
    listDeficiencies: ReturnType<typeof vi.fn>;
  };
  let mockAudit: { log: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockRepo = {
      findProject: vi.fn(),
      findTask: vi.fn(),
      findSubcontractor: vi.fn(),
      getNextInspectionNumber: vi.fn().mockResolvedValue("QI-001"),
      getNextDeficiencyNumber: vi.fn().mockResolvedValue("DEF-001"),
      createInspection: vi.fn(),
      findInspectionById: vi.fn(),
      recordInspectionResults: vi.fn(),
      listInspections: vi.fn(),
      createDeficiency: vi.fn(),
      findDeficiencyById: vi.fn(),
      resolveDeficiency: vi.fn(),
      listDeficiencies: vi.fn(),
    };
    mockAudit = { log: vi.fn().mockResolvedValue(undefined) };

    service = new QualityService(
      mockRepo as unknown as QualityRepository,
      mockAudit as unknown as AuditService,
    );
  });

  describe("scheduleInspection", () => {
    it("validates title presence and project existence", async () => {
      await expect(
        service.scheduleInspection(ORG, USER, {
          projectId: PROJECT_ID,
          title: "",
          scheduledDate: new Date(),
          inspectorId: USER,
        }),
      ).rejects.toThrow(ValidationError);

      mockRepo.findProject.mockResolvedValue(null);
      await expect(
        service.scheduleInspection(ORG, USER, {
          projectId: "nonexistent",
          title: "Pre-Pour Inspection",
          scheduledDate: new Date(),
          inspectorId: USER,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("schedules inspection and emits InspectionScheduled event", async () => {
      const inspection = makeInspection();
      mockRepo.findProject.mockResolvedValue({ id: PROJECT_ID });
      mockRepo.findTask.mockResolvedValue({ id: "task_1", projectId: PROJECT_ID });
      mockRepo.createInspection.mockResolvedValue(inspection);

      const result = await service.scheduleInspection(ORG, USER, {
        projectId: PROJECT_ID,
        title: "Rebar & Formwork Pre-Pour Inspection",
        scheduledDate: new Date("2026-09-15"),
        inspectorId: USER,
        linkedTaskId: "task_1",
      });

      expect(result.inspectionNumber).toBe("QI-001");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "INSPECTION_SCHEDULED",
          entity: "quality_inspection",
          entityId: INSPECTION_ID,
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "InspectionScheduled",
          entity: "domain_event",
          entityId: INSPECTION_ID,
        }),
      );
    });
  });

  describe("recordInspectionResults", () => {
    it("records passed inspection and emits InspectionPassed domain event", async () => {
      const existing = makeInspection();
      const passed = makeInspection({ status: "PASSED", completedDate: new Date() });

      mockRepo.findInspectionById.mockResolvedValue(existing);
      mockRepo.recordInspectionResults.mockResolvedValue(passed);

      const result = await service.recordInspectionResults(ORG, USER, {
        inspectionId: INSPECTION_ID,
        status: "PASSED",
      });

      expect(result.status).toBe("PASSED");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "INSPECTION_RECORDED",
          entity: "quality_inspection",
          entityId: INSPECTION_ID,
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "InspectionPassed",
          entity: "domain_event",
          entityId: INSPECTION_ID,
        }),
      );
    });

    it("auto-adjusts to PASSED_WITH_CONDITIONS if any checklist item failed", async () => {
      const existing = makeInspection();
      const conditionsPassed = makeInspection({
        status: "PASSED_WITH_CONDITIONS",
        completedDate: new Date(),
      });

      mockRepo.findInspectionById.mockResolvedValue(existing);
      mockRepo.recordInspectionResults.mockResolvedValue(conditionsPassed);

      const result = await service.recordInspectionResults(ORG, USER, {
        inspectionId: INSPECTION_ID,
        status: "PASSED",
        checklistItems: [
          { id: "c1", text: "Clean formwork", passed: true },
          { id: "c2", text: "Rebar clearance", passed: false, comment: "Requires extra spacer" },
        ],
      });

      expect(mockRepo.recordInspectionResults).toHaveBeenCalledWith(
        ORG,
        expect.objectContaining({ status: "PASSED_WITH_CONDITIONS" }),
      );
      expect(result.status).toBe("PASSED_WITH_CONDITIONS");
    });
  });

  describe("createDeficiency & resolveDeficiency", () => {
    it("creates deficiency and emits DeficiencyCreated domain event", async () => {
      const deficiency = makeDeficiency();
      mockRepo.findProject.mockResolvedValue({ id: PROJECT_ID });
      mockRepo.findSubcontractor.mockResolvedValue({ id: "sub_1" });
      mockRepo.findInspectionById.mockResolvedValue(makeInspection());
      mockRepo.createDeficiency.mockResolvedValue(deficiency);

      const result = await service.createDeficiency(ORG, USER, {
        projectId: PROJECT_ID,
        inspectionId: INSPECTION_ID,
        title: "Rebar chair spacing too wide",
        description: "Rebar sagging between chairs at Grid Line 6",
        subcontractorId: "sub_1",
      });

      expect(result.deficiencyNumber).toBe("DEF-001");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "DEFICIENCY_CREATED",
          entity: "deficiency",
          entityId: DEFICIENCY_ID,
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "DeficiencyCreated",
          entity: "domain_event",
          entityId: DEFICIENCY_ID,
        }),
      );
    });

    it("resolves deficiency and emits DeficiencyResolved domain event", async () => {
      const openDef = makeDeficiency({ status: "OPEN" });
      const resolvedDef = makeDeficiency({
        status: "RESOLVED",
        correctiveAction: "Installed additional chairs at 2 ft intervals",
        resolvedAt: new Date(),
        resolvedById: USER,
      });

      mockRepo.findDeficiencyById.mockResolvedValue(openDef);
      mockRepo.resolveDeficiency.mockResolvedValue(resolvedDef);

      const result = await service.resolveDeficiency(ORG, USER, {
        deficiencyId: DEFICIENCY_ID,
        correctiveAction: "Installed additional chairs at 2 ft intervals",
      });

      expect(result.status).toBe("RESOLVED");
      expect(result.correctiveAction).toBe("Installed additional chairs at 2 ft intervals");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "DEFICIENCY_RESOLVED",
          entity: "deficiency",
          entityId: DEFICIENCY_ID,
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "DeficiencyResolved",
          entity: "domain_event",
          entityId: DEFICIENCY_ID,
        }),
      );
    });
  });
});
