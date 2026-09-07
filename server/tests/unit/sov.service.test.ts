import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma, SovStatus } from "@prisma/client";
import { SovService } from "../../src/modules/commercial/sov.service.js";
import { NotFoundError, ValidationError } from "../../src/common/AppError.js";

describe("SovService", () => {
  let service: SovService;
  let mockSovRepo: any;
  let mockProjectRepo: any;
  let mockAudit: any;

  beforeEach(() => {
    mockSovRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      listByProject: vi.fn(),
      activate: vi.fn(),
    };

    mockProjectRepo = {
      findById: vi.fn(),
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    service = new SovService(mockSovRepo, mockProjectRepo, mockAudit);
  });

  describe("create", () => {
    it("should throw NotFoundError if project does not exist", async () => {
      mockProjectRepo.findById.mockResolvedValue(null);

      await expect(
        service.create("org-1", "user-1", {
          projectId: "proj-1",
          title: "Prime Contract SOV",
          items: [{ itemNumber: "01-100", description: "Sitework", scheduledValue: 5000 }],
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw ValidationError if scheduledValue is negative", async () => {
      mockProjectRepo.findById.mockResolvedValue({ id: "proj-1" });

      await expect(
        service.create("org-1", "user-1", {
          projectId: "proj-1",
          title: "Prime Contract SOV",
          items: [{ itemNumber: "01-100", description: "Sitework", scheduledValue: -100 }],
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("should create SOV and log audit", async () => {
      mockProjectRepo.findById.mockResolvedValue({ id: "proj-1" });
      const created = {
        id: "sov-1",
        title: "Prime Contract SOV",
        totalScheduledValue: new Prisma.Decimal(5000),
        items: [{ id: "item-1" }],
      };
      mockSovRepo.create.mockResolvedValue(created);

      const res = await service.create("org-1", "user-1", {
        projectId: "proj-1",
        title: "Prime Contract SOV",
        items: [{ itemNumber: "01-100", description: "Sitework", scheduledValue: 5000 }],
      });

      expect(res.id).toBe("sov-1");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SOV_CREATED",
          entity: "ScheduleOfValues",
        }),
      );
    });
  });

  describe("activate", () => {
    it("should activate DRAFT sov and log audit", async () => {
      mockSovRepo.findById.mockResolvedValue({
        id: "sov-1",
        status: SovStatus.DRAFT,
      });
      mockSovRepo.activate.mockResolvedValue({
        id: "sov-1",
        status: SovStatus.ACTIVE,
      });

      const res = await service.activate("org-1", "user-1", "sov-1");
      expect(res.status).toBe(SovStatus.ACTIVE);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SOV_ACTIVATED",
          entity: "ScheduleOfValues",
        }),
      );
    });

    it("should throw ValidationError if already ACTIVE", async () => {
      mockSovRepo.findById.mockResolvedValue({
        id: "sov-1",
        status: SovStatus.ACTIVE,
      });

      await expect(service.activate("org-1", "user-1", "sov-1")).rejects.toThrow(
        ValidationError,
      );
    });
  });
});
