import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma, RetainageReleaseStatus } from "@prisma/client";
import { RetainageService } from "../../src/modules/commercial/retainage.service.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../../src/common/AppError.js";

describe("RetainageService", () => {
  let service: RetainageService;
  let mockRetainageRepo: any;
  let mockProjectRepo: any;
  let mockAudit: any;

  beforeEach(() => {
    mockRetainageRepo = {
      getRetainageBalance: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      list: vi.fn(),
      updateStatus: vi.fn(),
    };

    mockProjectRepo = {
      findById: vi.fn(),
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    service = new RetainageService(mockRetainageRepo, mockProjectRepo, mockAudit);
  });

  describe("requestRelease", () => {
    it("should throw NotFoundError if project does not exist", async () => {
      mockProjectRepo.findById.mockResolvedValue(null);

      await expect(
        service.requestRelease("org-1", "user-1", {
          projectId: "proj-1",
          amountToRelease: 5000,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should reject if requested release amount exceeds current retainage held", async () => {
      mockProjectRepo.findById.mockResolvedValue({ id: "proj-1" });
      mockRetainageRepo.getRetainageBalance.mockResolvedValue({
        currentRetainageHeld: 3000,
      });

      await expect(
        service.requestRelease("org-1", "user-1", {
          projectId: "proj-1",
          amountToRelease: 5000,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("should create release request and log audit", async () => {
      mockProjectRepo.findById.mockResolvedValue({ id: "proj-1" });
      mockRetainageRepo.getRetainageBalance.mockResolvedValue({
        currentRetainageHeld: 10000,
      });
      const created = {
        id: "rel-1",
        releaseNumber: "RET-0001",
        amountToRelease: new Prisma.Decimal(4000),
      };
      mockRetainageRepo.create.mockResolvedValue(created);

      const res = await service.requestRelease("org-1", "user-1", {
        projectId: "proj-1",
        amountToRelease: 4000,
      });

      expect(res.id).toBe("rel-1");
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "RETAINAGE_RELEASE_REQUESTED",
          entity: "RetainageRelease",
        }),
      );
    });
  });

  describe("approveRelease", () => {
    it("should prevent requester from self-approving release (segregation of duties)", async () => {
      mockRetainageRepo.findById.mockResolvedValue({
        id: "rel-1",
        status: RetainageReleaseStatus.REQUESTED,
        requestedById: "user-requester-1",
      });

      await expect(
        service.approveRelease("org-1", "user-requester-1", { id: "rel-1" }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("should approve release and verify lien waivers", async () => {
      mockRetainageRepo.findById.mockResolvedValue({
        id: "rel-1",
        status: RetainageReleaseStatus.REQUESTED,
        requestedById: "user-requester-1",
      });
      mockRetainageRepo.updateStatus.mockResolvedValue({
        id: "rel-1",
        status: RetainageReleaseStatus.APPROVED,
        lienWaiverVerified: true,
      });

      const res = await service.approveRelease("org-1", "user-finance-2", {
        id: "rel-1",
        lienWaiverVerified: true,
      });

      expect(res.status).toBe(RetainageReleaseStatus.APPROVED);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "RETAINAGE_RELEASE_APPROVED",
          entity: "RetainageRelease",
        }),
      );
    });
  });
});
