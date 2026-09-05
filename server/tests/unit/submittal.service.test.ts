import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "../../src/common/index.js";
import { SubmittalService } from "../../src/modules/project-communications/submittal.service.js";
import type {
  SubmittalRepository,
  SubmittalWithDetails,
} from "../../src/modules/project-communications/submittal.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";

const ORG = "org_1";
const USER = "user_1";
const PROJECT_ID = "proj_1";
const SUBMITTAL_ID = "sub_1";

function makeSubmittal(overrides: Partial<SubmittalWithDetails> = {}): SubmittalWithDetails {
  return {
    id: SUBMITTAL_ID,
    orgId: ORG,
    projectId: PROJECT_ID,
    submittalNumber: "SUB-001",
    revision: 0,
    title: "Structural Concrete Mix Design",
    description: "4000 PSI ready mix submittal",
    specSection: "03 30 00",
    type: "PRODUCT_DATA",
    status: "SUBMITTED",
    subcontractorId: "subcontractor_1",
    submittedById: USER,
    leadReviewerId: "engineer_1",
    dueDate: new Date("2026-09-20"),
    requiredOnSiteDate: new Date("2026-10-01"),
    linkedTaskId: "task_1",
    createdAt: new Date(),
    updatedAt: new Date(),
    reviews: [],
    ...overrides,
  };
}

describe("SubmittalService", () => {
  let service: SubmittalService;
  let mockRepo: {
    findById: ReturnType<typeof vi.fn>;
    findProject: ReturnType<typeof vi.fn>;
    findTask: ReturnType<typeof vi.fn>;
    findSubcontractor: ReturnType<typeof vi.fn>;
    getNextSubmittalNumber: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    createRevision: ReturnType<typeof vi.fn>;
    addReview: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };
  let mockAudit: { log: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockRepo = {
      findById: vi.fn(),
      findProject: vi.fn(),
      findTask: vi.fn(),
      findSubcontractor: vi.fn(),
      getNextSubmittalNumber: vi.fn().mockResolvedValue("SUB-001"),
      create: vi.fn(),
      createRevision: vi.fn(),
      addReview: vi.fn(),
      list: vi.fn(),
    };
    mockAudit = { log: vi.fn().mockResolvedValue(undefined) };

    service = new SubmittalService(
      mockRepo as unknown as SubmittalRepository,
      mockAudit as unknown as AuditService,
    );
  });

  describe("createSubmittal", () => {
    it("validates title presence", async () => {
      await expect(
        service.createSubmittal(ORG, USER, {
          projectId: PROJECT_ID,
          title: "",
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("verifies project belongs to org", async () => {
      mockRepo.findProject.mockResolvedValue(null);

      await expect(
        service.createSubmittal(ORG, USER, {
          projectId: "nonexistent",
          title: "Mix Design",
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("verifies linked task belongs to same project", async () => {
      mockRepo.findProject.mockResolvedValue({ id: PROJECT_ID });
      mockRepo.findTask.mockResolvedValue({ id: "task_other", projectId: "other_proj" });

      await expect(
        service.createSubmittal(ORG, USER, {
          projectId: PROJECT_ID,
          title: "Mix Design",
          linkedTaskId: "task_other",
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("creates submittal, generates number, and logs domain events", async () => {
      const submittal = makeSubmittal();
      mockRepo.findProject.mockResolvedValue({ id: PROJECT_ID });
      mockRepo.findTask.mockResolvedValue({ id: "task_1", projectId: PROJECT_ID });
      mockRepo.findSubcontractor.mockResolvedValue({ id: "subcontractor_1" });
      mockRepo.create.mockResolvedValue(submittal);

      const result = await service.createSubmittal(ORG, USER, {
        projectId: PROJECT_ID,
        title: "Structural Concrete Mix Design",
        specSection: "03 30 00",
        subcontractorId: "subcontractor_1",
        linkedTaskId: "task_1",
      });

      expect(result.submittalNumber).toBe("SUB-001");
      expect(result.revision).toBe(0);
      expect(mockRepo.getNextSubmittalNumber).toHaveBeenCalledWith(PROJECT_ID);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SUBMITTAL_CREATED",
          entity: "submittal",
          entityId: SUBMITTAL_ID,
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SubmittalSubmitted",
          entity: "domain_event",
          entityId: SUBMITTAL_ID,
        }),
      );
    });
  });

  describe("createRevision", () => {
    it("creates rev 1 from rev 0 and emits SubmittalSubmitted domain event", async () => {
      const existing = makeSubmittal({ revision: 0, status: "REVISE_AND_RESUBMIT" });
      const revised = makeSubmittal({
        id: "sub_rev1",
        revision: 1,
        status: "SUBMITTED",
      });

      mockRepo.findById.mockResolvedValue(existing);
      mockRepo.createRevision.mockResolvedValue(revised);

      const result = await service.createRevision(ORG, USER, {
        submittalId: SUBMITTAL_ID,
        title: "Structural Concrete Mix Design - Rev 1",
      });

      expect(result.revision).toBe(1);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SUBMITTAL_REVISED",
          entity: "submittal",
          entityId: "sub_rev1",
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SubmittalSubmitted",
          entity: "domain_event",
          entityId: "sub_rev1",
        }),
      );
    });
  });

  describe("submitReview", () => {
    it("approves submittal and emits SubmittalApproved domain event", async () => {
      const existing = makeSubmittal({ status: "SUBMITTED" });
      const approved = makeSubmittal({
        status: "APPROVED",
        reviews: [
          {
            id: "rev_1",
            submittalId: SUBMITTAL_ID,
            orgId: ORG,
            reviewerId: "engineer_1",
            status: "APPROVED",
            comments: "Approved for construction.",
            reviewedAt: new Date(),
          },
        ],
      });

      mockRepo.findById.mockResolvedValue(existing);
      mockRepo.addReview.mockResolvedValue(approved);

      const result = await service.submitReview(ORG, "engineer_1", {
        submittalId: SUBMITTAL_ID,
        status: "APPROVED",
        comments: "Approved for construction.",
      });

      expect(result.status).toBe("APPROVED");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SUBMITTAL_REVIEWED",
          entity: "submittal",
          entityId: SUBMITTAL_ID,
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SubmittalApproved",
          entity: "domain_event",
          entityId: SUBMITTAL_ID,
        }),
      );
    });

    it("rejects submittal and emits SubmittalRejected domain event", async () => {
      const existing = makeSubmittal({ status: "SUBMITTED" });
      const rejected = makeSubmittal({
        status: "REVISE_AND_RESUBMIT",
        reviews: [
          {
            id: "rev_2",
            submittalId: SUBMITTAL_ID,
            orgId: ORG,
            reviewerId: "engineer_1",
            status: "REVISE_AND_RESUBMIT",
            comments: "Compressive strength data missing.",
            reviewedAt: new Date(),
          },
        ],
      });

      mockRepo.findById.mockResolvedValue(existing);
      mockRepo.addReview.mockResolvedValue(rejected);

      const result = await service.submitReview(ORG, "engineer_1", {
        submittalId: SUBMITTAL_ID,
        status: "REVISE_AND_RESUBMIT",
        comments: "Compressive strength data missing.",
      });

      expect(result.status).toBe("REVISE_AND_RESUBMIT");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SubmittalRejected",
          entity: "domain_event",
          entityId: SUBMITTAL_ID,
        }),
      );
    });

    it("rejects invalid review status", async () => {
      await expect(
        service.submitReview(ORG, USER, {
          submittalId: SUBMITTAL_ID,
          status: "DRAFT" as unknown as "APPROVED",
        }),
      ).rejects.toThrow(ValidationError);
    });
  });
});
