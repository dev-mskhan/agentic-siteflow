import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { PartnerEvaluation } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../src/common/index.js";
import { PartnerPerformanceService } from "../../src/modules/subcontractors/partner-performance.service.js";
import type { PartnerPerformanceRepository } from "../../src/modules/subcontractors/partner-performance.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";

const ORG = "org_1";
const USER = "user_1";
const SUB_ID = "sub_1";
const VENDOR_ID = "vnd_1";
const PROJECT_ID = "proj_1";

function makeEvaluation(
  overrides: Partial<PartnerEvaluation> = {},
): PartnerEvaluation {
  return {
    id: "eval_1",
    orgId: ORG,
    partnerType: "SUBCONTRACTOR",
    subcontractorId: SUB_ID,
    vendorId: null,
    projectId: PROJECT_ID,
    evaluationDate: new Date(),
    qualityRating: 4,
    timelinessRating: 5,
    communicationRating: 4,
    safetyRating: 5,
    overallRating: new Prisma.Decimal(4.5),
    comments: "Great performance",
    evaluatorId: USER,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("PartnerPerformanceService", () => {
  let service: PartnerPerformanceService;
  let mockRepo: {
    findSubcontractor: ReturnType<typeof vi.fn>;
    findVendor: ReturnType<typeof vi.fn>;
    findProject: ReturnType<typeof vi.fn>;
    createEvaluation: ReturnType<typeof vi.fn>;
    findByPartner: ReturnType<typeof vi.fn>;
    updatePartnerRating: ReturnType<typeof vi.fn>;
    getVendorDeliveries: ReturnType<typeof vi.fn>;
    getSubcontractorTasks: ReturnType<typeof vi.fn>;
  };
  let mockAudit: { log: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockRepo = {
      findSubcontractor: vi.fn(),
      findVendor: vi.fn(),
      findProject: vi.fn(),
      createEvaluation: vi.fn(),
      findByPartner: vi.fn(),
      updatePartnerRating: vi.fn(),
      getVendorDeliveries: vi.fn(),
      getSubcontractorTasks: vi.fn(),
    };
    mockAudit = { log: vi.fn().mockResolvedValue(undefined) };

    service = new PartnerPerformanceService(
      mockRepo as unknown as PartnerPerformanceRepository,
      mockAudit as unknown as AuditService,
    );
  });

  describe("evaluatePartner", () => {
    it("validates 1-5 scale limits and throws ValidationError for invalid ratings", async () => {
      await expect(
        service.evaluatePartner(ORG, USER, {
          partnerType: "SUBCONTRACTOR",
          subcontractorId: SUB_ID,
          qualityRating: 6, // Invalid > 5
          timelinessRating: 4,
          communicationRating: 4,
        }),
      ).rejects.toThrow(ValidationError);

      await expect(
        service.evaluatePartner(ORG, USER, {
          partnerType: "SUBCONTRACTOR",
          subcontractorId: SUB_ID,
          qualityRating: 0, // Invalid < 1
          timelinessRating: 4,
          communicationRating: 4,
        }),
      ).rejects.toThrow(ValidationError);

      await expect(
        service.evaluatePartner(ORG, USER, {
          partnerType: "SUBCONTRACTOR",
          subcontractorId: SUB_ID,
          qualityRating: 4.5, // Non-integer
          timelinessRating: 4,
          communicationRating: 4,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("evaluates subcontractor with safety rating, computes overall rating, and updates aggregate rating", async () => {
      const evaluation = makeEvaluation({
        qualityRating: 4,
        timelinessRating: 4,
        communicationRating: 5,
        safetyRating: 5,
        overallRating: new Prisma.Decimal(4.5), // (4+4+5+5)/4 = 4.5
      });

      mockRepo.findSubcontractor.mockResolvedValue({ id: SUB_ID, name: "Apex Electrical" });
      mockRepo.findProject.mockResolvedValue({ id: PROJECT_ID });
      mockRepo.createEvaluation.mockResolvedValue(evaluation);
      mockRepo.findByPartner.mockResolvedValue([
        evaluation,
        makeEvaluation({ id: "eval_2", overallRating: new Prisma.Decimal(3.5) }),
      ]);
      mockRepo.updatePartnerRating.mockResolvedValue(undefined);

      const result = await service.evaluatePartner(ORG, USER, {
        partnerType: "SUBCONTRACTOR",
        subcontractorId: SUB_ID,
        projectId: PROJECT_ID,
        qualityRating: 4,
        timelinessRating: 4,
        communicationRating: 5,
        safetyRating: 5,
        comments: "Solid work",
      });

      expect(result.id).toBe("eval_1");
      expect(mockRepo.createEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: ORG,
          partnerType: "SUBCONTRACTOR",
          subcontractorId: SUB_ID,
          overallRating: 4.5,
        }),
      );
      // Average of 4.5 and 3.5 = 4.0
      expect(mockRepo.updatePartnerRating).toHaveBeenCalledWith(
        ORG,
        "SUBCONTRACTOR",
        SUB_ID,
        4,
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PARTNER_EVALUATION_CREATED",
          entity: "partner_evaluation",
          entityId: "eval_1",
        }),
      );
    });

    it("evaluates vendor without safety rating (3-part average)", async () => {
      const evaluation = makeEvaluation({
        partnerType: "VENDOR",
        subcontractorId: null,
        vendorId: VENDOR_ID,
        safetyRating: null,
        overallRating: new Prisma.Decimal(4.0), // (4+5+3)/3 = 4.0
      });

      mockRepo.findVendor.mockResolvedValue({ id: VENDOR_ID, name: "Global Cement" });
      mockRepo.createEvaluation.mockResolvedValue(evaluation);
      mockRepo.findByPartner.mockResolvedValue([evaluation]);
      mockRepo.updatePartnerRating.mockResolvedValue(undefined);

      const result = await service.evaluatePartner(ORG, USER, {
        partnerType: "VENDOR",
        vendorId: VENDOR_ID,
        qualityRating: 4,
        timelinessRating: 5,
        communicationRating: 3,
      });

      expect(result.overallRating.toNumber()).toBe(4.0);
      expect(mockRepo.updatePartnerRating).toHaveBeenCalledWith(
        ORG,
        "VENDOR",
        VENDOR_ID,
        4.0,
      );
    });

    it("throws NotFoundError if partner does not exist", async () => {
      mockRepo.findSubcontractor.mockResolvedValue(null);

      await expect(
        service.evaluatePartner(ORG, USER, {
          partnerType: "SUBCONTRACTOR",
          subcontractorId: "nonexistent",
          qualityRating: 4,
          timelinessRating: 4,
          communicationRating: 4,
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getVendorPerformanceMetrics", () => {
    it("accurately calculates on-time delivery rate, acceptance rate, and composite score", async () => {
      mockRepo.findVendor.mockResolvedValue({ id: VENDOR_ID, name: "Global Cement" });

      mockRepo.findByPartner.mockResolvedValue([
        makeEvaluation({
          qualityRating: 5,
          timelinessRating: 4,
          communicationRating: 5,
          overallRating: new Prisma.Decimal(4.67),
        }),
      ]);

      mockRepo.getVendorDeliveries.mockResolvedValue([
        {
          id: "del_1",
          status: "DELIVERED",
          isDelayed: false,
          delayedDays: 0,
          receiptItems: [
            {
              quantityReceived: new Prisma.Decimal(100),
              quantityAccepted: new Prisma.Decimal(95),
              quantityRejected: new Prisma.Decimal(5),
            },
          ],
        },
        {
          id: "del_2",
          status: "DELIVERED",
          isDelayed: true,
          delayedDays: 4,
          receiptItems: [
            {
              quantityReceived: new Prisma.Decimal(100),
              quantityAccepted: new Prisma.Decimal(100),
              quantityRejected: new Prisma.Decimal(0),
            },
          ],
        },
      ]);

      const metrics = await service.getVendorPerformanceMetrics(ORG, VENDOR_ID);

      expect(metrics.vendorId).toBe(VENDOR_ID);
      expect(metrics.totalDeliveries).toBe(2);
      expect(metrics.deliveredCount).toBe(2);
      expect(metrics.onTimeDeliveries).toBe(1);
      expect(metrics.delayedDeliveries).toBe(1);
      expect(metrics.onTimeDeliveryRate).toBe(50); // 1 / 2 * 100 = 50%
      expect(metrics.averageDelayDays).toBe(4);
      expect(metrics.totalQuantityReceived).toBe(200);
      expect(metrics.totalQuantityAccepted).toBe(195);
      expect(metrics.totalQuantityRejected).toBe(5);
      expect(metrics.qualityAcceptanceRate).toBe(97.5); // 195 / 200 * 100 = 97.5%
      expect(metrics.compositeScore).toBeGreaterThan(0);
    });

    it("handles zero deliveries gracefully", async () => {
      mockRepo.findVendor.mockResolvedValue({ id: VENDOR_ID, name: "Global Cement" });
      mockRepo.findByPartner.mockResolvedValue([]);
      mockRepo.getVendorDeliveries.mockResolvedValue([]);

      const metrics = await service.getVendorPerformanceMetrics(ORG, VENDOR_ID);

      expect(metrics.totalDeliveries).toBe(0);
      expect(metrics.onTimeDeliveryRate).toBe(100);
      expect(metrics.qualityAcceptanceRate).toBe(100);
    });
  });

  describe("getSubcontractorPerformanceMetrics", () => {
    it("accurately calculates task on-time completion rate and composite score", async () => {
      mockRepo.findSubcontractor.mockResolvedValue({ id: SUB_ID, name: "Apex Electrical" });

      mockRepo.findByPartner.mockResolvedValue([
        makeEvaluation({
          qualityRating: 4,
          timelinessRating: 4,
          communicationRating: 4,
          safetyRating: 4,
          overallRating: new Prisma.Decimal(4.0),
        }),
      ]);

      mockRepo.getSubcontractorTasks.mockResolvedValue([
        {
          id: "task_1",
          status: "DONE",
          plannedEndDate: new Date("2026-09-01"),
          actualEndDate: new Date("2026-09-01"),
        },
        {
          id: "task_2",
          status: "DONE",
          plannedEndDate: new Date("2026-09-02"),
          actualEndDate: new Date("2026-09-01"),
        },
        {
          id: "task_3",
          status: "DONE",
          plannedEndDate: new Date("2026-09-01"),
          actualEndDate: new Date("2026-09-04"),
        },
        {
          id: "task_4",
          status: "IN_PROGRESS",
          plannedEndDate: new Date("2099-01-01"),
          actualEndDate: null,
        },
      ]);

      const metrics = await service.getSubcontractorPerformanceMetrics(ORG, SUB_ID);

      expect(metrics.subcontractorId).toBe(SUB_ID);
      expect(metrics.totalAssignedTasks).toBe(4);
      expect(metrics.completedTasks).toBe(3);
      expect(metrics.onTimeCompletedTasks).toBe(2);
      expect(metrics.delayedTasks).toBe(1);
      // 2 on-time out of 3 completed = 66.67%
      expect(metrics.onTimeCompletionRate).toBe(66.67);
      expect(metrics.averageTaskDelayDays).toBe(3);
      expect(metrics.compositeScore).toBeGreaterThan(0);
    });

    it("handles zero assigned tasks gracefully", async () => {
      mockRepo.findSubcontractor.mockResolvedValue({ id: SUB_ID, name: "Apex Electrical" });
      mockRepo.findByPartner.mockResolvedValue([]);
      mockRepo.getSubcontractorTasks.mockResolvedValue([]);

      const metrics = await service.getSubcontractorPerformanceMetrics(ORG, SUB_ID);

      expect(metrics.totalAssignedTasks).toBe(0);
      expect(metrics.onTimeCompletionRate).toBe(100);
    });
  });
});
