import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "../../src/common/index.js";
import { RfiService } from "../../src/modules/project-communications/rfi.service.js";
import type { RfiRepository, RfiWithDetails } from "../../src/modules/project-communications/rfi.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";

const ORG = "org_1";
const USER = "user_1";
const PROJECT_ID = "proj_1";
const RFI_ID = "rfi_1";

function makeRfi(overrides: Partial<RfiWithDetails> = {}): RfiWithDetails {
  return {
    id: RFI_ID,
    orgId: ORG,
    projectId: PROJECT_ID,
    rfiNumber: "RFI-001",
    title: "Rebar clearance clarification",
    question: "What is the minimum clear cover required for shear walls at Grid Line 3?",
    suggestedSolution: "Assume 2 inches per standard details.",
    discipline: "STRUCTURAL",
    priority: "HIGH",
    status: "OPEN",
    dueDate: new Date("2026-09-15"),
    scheduleImpactDays: 2,
    costImpactAmount: null,
    linkedTaskId: "task_1",
    assignedToId: "user_engineer",
    requestedById: USER,
    answeredById: null,
    answeredAt: null,
    closedById: null,
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    responses: [],
    ...overrides,
  };
}

describe("RfiService", () => {
  let service: RfiService;
  let mockRepo: {
    findById: ReturnType<typeof vi.fn>;
    findProject: ReturnType<typeof vi.fn>;
    findTask: ReturnType<typeof vi.fn>;
    getNextRfiNumber: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    addResponse: ReturnType<typeof vi.fn>;
    markAnswered: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };
  let mockAudit: { log: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockRepo = {
      findById: vi.fn(),
      findProject: vi.fn(),
      findTask: vi.fn(),
      getNextRfiNumber: vi.fn().mockResolvedValue("RFI-001"),
      create: vi.fn(),
      update: vi.fn(),
      addResponse: vi.fn(),
      markAnswered: vi.fn(),
      close: vi.fn(),
      list: vi.fn(),
    };
    mockAudit = { log: vi.fn().mockResolvedValue(undefined) };

    service = new RfiService(
      mockRepo as unknown as RfiRepository,
      mockAudit as unknown as AuditService,
    );
  });

  describe("createRfi", () => {
    it("validates title and question presence", async () => {
      await expect(
        service.createRfi(ORG, USER, {
          projectId: PROJECT_ID,
          title: "",
          question: "Question",
        }),
      ).rejects.toThrow(ValidationError);

      await expect(
        service.createRfi(ORG, USER, {
          projectId: PROJECT_ID,
          title: "Title",
          question: "",
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("verifies project belongs to org", async () => {
      mockRepo.findProject.mockResolvedValue(null);

      await expect(
        service.createRfi(ORG, USER, {
          projectId: "nonexistent",
          title: "Title",
          question: "Question",
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("verifies linked task belongs to same project", async () => {
      mockRepo.findProject.mockResolvedValue({ id: PROJECT_ID });
      mockRepo.findTask.mockResolvedValue({ id: "task_other", projectId: "other_proj" });

      await expect(
        service.createRfi(ORG, USER, {
          projectId: PROJECT_ID,
          title: "Title",
          question: "Question",
          linkedTaskId: "task_other",
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("generates sequential rfiNumber and emits RfiCreated domain event", async () => {
      const rfi = makeRfi();
      mockRepo.findProject.mockResolvedValue({ id: PROJECT_ID });
      mockRepo.findTask.mockResolvedValue({ id: "task_1", projectId: PROJECT_ID });
      mockRepo.create.mockResolvedValue(rfi);

      const result = await service.createRfi(ORG, USER, {
        projectId: PROJECT_ID,
        title: "Rebar clearance clarification",
        question: "What is the minimum clear cover required for shear walls at Grid Line 3?",
        linkedTaskId: "task_1",
      });

      expect(result.rfiNumber).toBe("RFI-001");
      expect(mockRepo.getNextRfiNumber).toHaveBeenCalledWith(PROJECT_ID);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "RFI_CREATED",
          entity: "rfi",
          entityId: RFI_ID,
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "RfiCreated",
          entity: "domain_event",
          entityId: RFI_ID,
        }),
      );
    });
  });

  describe("markAnswered", () => {
    it("transitions OPEN RFI to ANSWERED and emits RfiAnswered event", async () => {
      const rfi = makeRfi({ status: "OPEN" });
      const answeredRfi = makeRfi({
        status: "ANSWERED",
        answeredById: "engineer_1",
        answeredAt: new Date(),
        responses: [
          {
            id: "resp_1",
            rfiId: RFI_ID,
            orgId: ORG,
            responseContent: "Minimum 2-inch cover required.",
            isOfficialAnswer: true,
            respondedById: "engineer_1",
            createdAt: new Date(),
          },
        ],
      });

      mockRepo.findById.mockResolvedValue(rfi);
      mockRepo.markAnswered.mockResolvedValue(answeredRfi);

      const result = await service.markAnswered(
        ORG,
        RFI_ID,
        "engineer_1",
        "Minimum 2-inch cover required.",
      );

      expect(result.status).toBe("ANSWERED");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "RFI_ANSWERED",
          entity: "rfi",
          entityId: RFI_ID,
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "RfiAnswered",
          entity: "domain_event",
          entityId: RFI_ID,
        }),
      );
    });
  });

  describe("closeRfi", () => {
    it("transitions ANSWERED RFI to CLOSED and emits RfiClosed domain event", async () => {
      const answered = makeRfi({ status: "ANSWERED" });
      const closed = makeRfi({ status: "CLOSED", closedById: USER, closedAt: new Date() });

      mockRepo.findById.mockResolvedValue(answered);
      mockRepo.close.mockResolvedValue(closed);

      const result = await service.closeRfi(ORG, RFI_ID, USER);

      expect(result.status).toBe("CLOSED");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "RFI_CLOSED",
          entity: "rfi",
          entityId: RFI_ID,
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "RfiClosed",
          entity: "domain_event",
          entityId: RFI_ID,
        }),
      );
    });

    it("rejects closing an RFI directly from DRAFT", async () => {
      mockRepo.findById.mockResolvedValue(makeRfi({ status: "DRAFT" }));

      await expect(service.closeRfi(ORG, RFI_ID, USER)).rejects.toThrow(ValidationError);
    });
  });
});
