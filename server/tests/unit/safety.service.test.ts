import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "../../src/common/index.js";
import { SafetyService } from "../../src/modules/quality-safety/safety.service.js";
import type {
  SafetyRepository,
  SafetyIncidentWithDetails,
} from "../../src/modules/quality-safety/safety.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";

const ORG = "org_1";
const USER = "user_1";
const PROJECT_ID = "proj_1";
const INCIDENT_ID = "saf_1";
const ACTION_ID = "act_1";

function makeIncident(overrides: Partial<SafetyIncidentWithDetails> = {}): SafetyIncidentWithDetails {
  return {
    id: INCIDENT_ID,
    orgId: ORG,
    projectId: PROJECT_ID,
    incidentNumber: "SAF-2026-001",
    incidentDate: new Date("2026-09-10"),
    incidentType: "LOST_TIME",
    severity: "HIGH",
    status: "REPORTED",
    title: "Tripped on scaffolding plank",
    description: "Worker lost footing on loose toe-board and strained ankle",
    location: "Grid 4 Scaffold Level 3",
    isOshaRecordable: true,
    oshaForm300Category: "Days away from work",
    lostWorkDays: 3,
    restrictedWorkDays: 0,
    affectedPersonName: "Bob Smith",
    affectedPersonType: "EMPLOYEE",
    subcontractorId: null,
    investigationSummary: null,
    rootCause: null,
    reportedById: USER,
    investigatedById: null,
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    reportedBy: { id: USER, firstName: "Alice", lastName: "Safety", email: "alice@example.com" },
    investigatedBy: null,
    subcontractor: null,
    correctiveActions: [],
    ...overrides,
  };
}

describe("SafetyService", () => {
  let service: SafetyService;
  let mockRepo: {
    findProject: ReturnType<typeof vi.fn>;
    findSubcontractor: ReturnType<typeof vi.fn>;
    getNextIncidentNumber: ReturnType<typeof vi.fn>;
    createIncident: ReturnType<typeof vi.fn>;
    findIncidentById: ReturnType<typeof vi.fn>;
    updateInvestigation: ReturnType<typeof vi.fn>;
    addCorrectiveAction: ReturnType<typeof vi.fn>;
    findCorrectiveActionById: ReturnType<typeof vi.fn>;
    completeCorrectiveAction: ReturnType<typeof vi.fn>;
    listIncidents: ReturnType<typeof vi.fn>;
  };
  let mockAudit: { log: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockRepo = {
      findProject: vi.fn(),
      findSubcontractor: vi.fn(),
      getNextIncidentNumber: vi.fn().mockResolvedValue("SAF-2026-001"),
      createIncident: vi.fn(),
      findIncidentById: vi.fn(),
      updateInvestigation: vi.fn(),
      addCorrectiveAction: vi.fn(),
      findCorrectiveActionById: vi.fn(),
      completeCorrectiveAction: vi.fn(),
      listIncidents: vi.fn(),
    };
    mockAudit = { log: vi.fn().mockResolvedValue(undefined) };

    service = new SafetyService(
      mockRepo as unknown as SafetyRepository,
      mockAudit as unknown as AuditService,
    );
  });

  describe("reportIncident", () => {
    it("validates title, description, and project", async () => {
      await expect(
        service.reportIncident(ORG, USER, {
          projectId: PROJECT_ID,
          incidentDate: new Date(),
          incidentType: "FIRST_AID",
          title: "",
          description: "Cut finger",
        }),
      ).rejects.toThrow(ValidationError);

      mockRepo.findProject.mockResolvedValue(null);
      await expect(
        service.reportIncident(ORG, USER, {
          projectId: "nonexistent",
          incidentDate: new Date(),
          incidentType: "FIRST_AID",
          title: "Cut finger",
          description: "Minor laceration",
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("auto-classifies OSHA recordable when lostWorkDays > 0 and emits SafetyIncidentCreated event", async () => {
      const incident = makeIncident();
      mockRepo.findProject.mockResolvedValue({ id: PROJECT_ID });
      mockRepo.createIncident.mockResolvedValue(incident);

      const result = await service.reportIncident(ORG, USER, {
        projectId: PROJECT_ID,
        incidentDate: new Date("2026-09-10"),
        incidentType: "LOST_TIME",
        title: "Tripped on scaffolding plank",
        description: "Worker lost footing on loose toe-board and strained ankle",
        lostWorkDays: 3,
      });

      expect(result.incidentNumber).toBe("SAF-2026-001");
      expect(result.isOshaRecordable).toBe(true);
      expect(mockRepo.createIncident).toHaveBeenCalledWith(
        ORG,
        USER,
        "SAF-2026-001",
        expect.objectContaining({
          isOshaRecordable: true,
          oshaForm300Category: "Days away from work",
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SAFETY_INCIDENT_REPORTED",
          entity: "safety_incident",
          entityId: INCIDENT_ID,
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SafetyIncidentCreated",
          entity: "domain_event",
          entityId: INCIDENT_ID,
        }),
      );
    });
  });

  describe("updateInvestigation", () => {
    it("records investigation and emits SafetyIncidentInvestigated event", async () => {
      const existing = makeIncident();
      const updated = makeIncident({
        status: "UNDER_INVESTIGATION",
        investigationSummary: "Toe-board was not secured according to OSHA standard 1926.451(h)(2)",
        rootCause: "Subcontractor rushed scaffold erection without supervisor sign-off",
      });

      mockRepo.findIncidentById.mockResolvedValue(existing);
      mockRepo.updateInvestigation.mockResolvedValue(updated);

      const result = await service.updateInvestigation(ORG, USER, {
        incidentId: INCIDENT_ID,
        investigationSummary: "Toe-board was not secured according to OSHA standard 1926.451(h)(2)",
        rootCause: "Subcontractor rushed scaffold erection without supervisor sign-off",
      });

      expect(result.status).toBe("UNDER_INVESTIGATION");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SAFETY_INCIDENT_INVESTIGATED",
          entity: "safety_incident",
          entityId: INCIDENT_ID,
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SafetyIncidentInvestigated",
          entity: "domain_event",
          entityId: INCIDENT_ID,
        }),
      );
    });
  });

  describe("corrective actions", () => {
    it("adds corrective action and logs audit", async () => {
      mockRepo.findIncidentById.mockResolvedValue(makeIncident());
      mockRepo.addCorrectiveAction.mockResolvedValue({
        id: ACTION_ID,
        incidentId: INCIDENT_ID,
        orgId: ORG,
        actionDescription: "Re-inspect all scaffold toe-boards and retrain crew",
        assignedToId: USER,
        dueDate: new Date("2026-09-12"),
        completedDate: null,
        isCompleted: false,
        verificationNotes: null,
        createdAt: new Date(),
        assignedTo: { id: USER, firstName: "Alice", lastName: "Safety", email: "alice@example.com" },
      });

      const result = await service.addCorrectiveAction(ORG, USER, {
        incidentId: INCIDENT_ID,
        actionDescription: "Re-inspect all scaffold toe-boards and retrain crew",
        assignedToId: USER,
        dueDate: new Date("2026-09-12"),
      });

      expect(result.id).toBe(ACTION_ID);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SAFETY_CORRECTIVE_ACTION_ADDED",
          entity: "safety_corrective_action",
          entityId: ACTION_ID,
        }),
      );
    });

    it("completes corrective action with verification notes", async () => {
      mockRepo.findCorrectiveActionById.mockResolvedValue({ id: ACTION_ID, orgId: ORG });
      mockRepo.completeCorrectiveAction.mockResolvedValue({
        id: ACTION_ID,
        isCompleted: true,
        completedDate: new Date(),
        verificationNotes: "All scaffolds verified compliant",
      });

      const result = await service.completeCorrectiveAction(ORG, USER, {
        correctiveActionId: ACTION_ID,
        verificationNotes: "All scaffolds verified compliant",
      });

      expect(result.isCompleted).toBe(true);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SAFETY_CORRECTIVE_ACTION_COMPLETED",
          entity: "safety_corrective_action",
          entityId: ACTION_ID,
        }),
      );
    });
  });
});
