import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { NotFoundError } from "../../src/common/index.js";
import { CommittedCostService } from "../../src/modules/procurement/committed-cost.service.js";
import type { CommittedCostRepository } from "../../src/modules/procurement/committed-cost.repository.js";

const ORG = "org_1";
const PROJECT_1 = "proj_1";
const PROJECT_2 = "proj_2";
const CC_1 = "cc_1";
const CC_2 = "cc_2";

describe("CommittedCostService", () => {
  let service: CommittedCostService;
  let mockRepo: {
    findProject: ReturnType<typeof vi.fn>;
    findOrgProjects: ReturnType<typeof vi.fn>;
    getCommittedPurchaseOrders: ReturnType<typeof vi.fn>;
    getCommittedSubcontractorContracts: ReturnType<typeof vi.fn>;
    getCostCodesByIds: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockRepo = {
      findProject: vi.fn(),
      findOrgProjects: vi.fn(),
      getCommittedPurchaseOrders: vi.fn(),
      getCommittedSubcontractorContracts: vi.fn(),
      getCostCodesByIds: vi.fn(),
    };

    service = new CommittedCostService(
      mockRepo as unknown as CommittedCostRepository,
    );
  });

  describe("getProjectCommittedCost", () => {
    it("accurately sums issued POs and active contracts and calculates uncommitted budget", async () => {
      mockRepo.findProject.mockResolvedValue({
        id: PROJECT_1,
        name: "Downtown Tower",
        currency: "USD",
        budget: new Prisma.Decimal(10000),
      });

      mockRepo.getCommittedPurchaseOrders.mockResolvedValue([
        {
          id: "po_1",
          subtotal: new Prisma.Decimal(1500),
          totalAmount: new Prisma.Decimal(1500),
          items: [
            { id: "poi_1", totalPrice: new Prisma.Decimal(1000), costCodeId: CC_1 },
            { id: "poi_2", totalPrice: new Prisma.Decimal(500), costCodeId: CC_2 },
          ],
        },
      ]);

      mockRepo.getCommittedSubcontractorContracts.mockResolvedValue([
        {
          id: "sub_1",
          contractValue: new Prisma.Decimal(3500),
          costCodeId: CC_1,
        },
      ]);

      mockRepo.getCostCodesByIds.mockResolvedValue([
        { id: CC_1, code: "03-3000", name: "Cast-in-Place Concrete" },
        { id: CC_2, code: "05-1200", name: "Structural Steel" },
      ]);

      const result = await service.getProjectCommittedCost(ORG, PROJECT_1);

      expect(result.projectId).toBe(PROJECT_1);
      expect(result.currency).toBe("USD");
      expect(result.poCommittedTotal).toBe(1500);
      expect(result.subcontractorCommittedTotal).toBe(3500);
      expect(result.totalCommittedCost).toBe(5000);
      expect(result.budget).toBe(10000);
      expect(result.uncommittedBudget).toBe(5000);
      expect(result.isOverCommitted).toBe(false);

      expect(result.costCodeBreakdown).toHaveLength(2);
      const cc1 = result.costCodeBreakdown.find((c) => c.costCodeId === CC_1);
      expect(cc1).toBeDefined();
      expect(cc1!.poCommitted).toBe(1000);
      expect(cc1!.subcontractorCommitted).toBe(3500);
      expect(cc1!.totalCommitted).toBe(4500);

      const cc2 = result.costCodeBreakdown.find((c) => c.costCodeId === CC_2);
      expect(cc2).toBeDefined();
      expect(cc2!.poCommitted).toBe(500);
      expect(cc2!.subcontractorCommitted).toBe(0);
      expect(cc2!.totalCommitted).toBe(500);
    });

    it("flags project when commitments exceed budget", async () => {
      mockRepo.findProject.mockResolvedValue({
        id: PROJECT_1,
        name: "Downtown Tower",
        currency: "USD",
        budget: new Prisma.Decimal(4000), // Budget is 4000
      });

      mockRepo.getCommittedPurchaseOrders.mockResolvedValue([
        {
          id: "po_1",
          subtotal: new Prisma.Decimal(3000),
          totalAmount: new Prisma.Decimal(3000),
          items: [
            { id: "poi_1", totalPrice: new Prisma.Decimal(3000), costCodeId: null },
          ],
        },
      ]);

      mockRepo.getCommittedSubcontractorContracts.mockResolvedValue([
        {
          id: "sub_1",
          contractValue: new Prisma.Decimal(2000),
          costCodeId: null,
        },
      ]);

      mockRepo.getCostCodesByIds.mockResolvedValue([]);

      const result = await service.getProjectCommittedCost(ORG, PROJECT_1);

      expect(result.totalCommittedCost).toBe(5000);
      expect(result.budget).toBe(4000);
      expect(result.uncommittedBudget).toBe(-1000);
      expect(result.isOverCommitted).toBe(true);
    });

    it("handles null project budget gracefully", async () => {
      mockRepo.findProject.mockResolvedValue({
        id: PROJECT_1,
        name: "Unbudgeted Project",
        currency: "USD",
        budget: null,
      });

      mockRepo.getCommittedPurchaseOrders.mockResolvedValue([]);
      mockRepo.getCommittedSubcontractorContracts.mockResolvedValue([]);
      mockRepo.getCostCodesByIds.mockResolvedValue([]);

      const result = await service.getProjectCommittedCost(ORG, PROJECT_1);

      expect(result.budget).toBeNull();
      expect(result.uncommittedBudget).toBeNull();
      expect(result.isOverCommitted).toBe(false);
      expect(result.totalCommittedCost).toBe(0);
    });

    it("enforces tenant isolation: throws NotFoundError when project is not in org", async () => {
      mockRepo.findProject.mockResolvedValue(null);

      await expect(
        service.getProjectCommittedCost("other_org", PROJECT_1),
      ).rejects.toThrow(NotFoundError);

      expect(mockRepo.findProject).toHaveBeenCalledWith("other_org", PROJECT_1);
      expect(mockRepo.getCommittedPurchaseOrders).not.toHaveBeenCalled();
    });
  });

  describe("getOrgCommittedCostOverview", () => {
    it("aggregates committed costs across all active projects in the organization", async () => {
      mockRepo.findOrgProjects.mockResolvedValue([
        { id: PROJECT_1, name: "Project Alpha", currency: "USD", budget: new Prisma.Decimal(10000) },
        { id: PROJECT_2, name: "Project Beta", currency: "USD", budget: new Prisma.Decimal(20000) },
      ]);

      mockRepo.findProject
        .mockResolvedValueOnce({ id: PROJECT_1, name: "Project Alpha", currency: "USD", budget: new Prisma.Decimal(10000) })
        .mockResolvedValueOnce({ id: PROJECT_2, name: "Project Beta", currency: "USD", budget: new Prisma.Decimal(20000) });

      mockRepo.getCommittedPurchaseOrders
        .mockResolvedValueOnce([
          {
            id: "po_1",
            subtotal: new Prisma.Decimal(2000),
            totalAmount: new Prisma.Decimal(2000),
            items: [{ id: "poi_1", totalPrice: new Prisma.Decimal(2000), costCodeId: null }],
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "po_2",
            subtotal: new Prisma.Decimal(3000),
            totalAmount: new Prisma.Decimal(3000),
            items: [{ id: "poi_2", totalPrice: new Prisma.Decimal(3000), costCodeId: null }],
          },
        ]);

      mockRepo.getCommittedSubcontractorContracts
        .mockResolvedValueOnce([
          { id: "sub_1", contractValue: new Prisma.Decimal(1000), costCodeId: null },
        ])
        .mockResolvedValueOnce([
          { id: "sub_2", contractValue: new Prisma.Decimal(5000), costCodeId: null },
        ]);

      mockRepo.getCostCodesByIds.mockResolvedValue([]);

      const overview = await service.getOrgCommittedCostOverview(ORG);

      expect(overview.orgId).toBe(ORG);
      expect(overview.totalPoCommitted).toBe(5000); // 2000 + 3000
      expect(overview.totalSubcontractorCommitted).toBe(6000); // 1000 + 5000
      expect(overview.totalCommittedCost).toBe(11000);
      expect(overview.projects).toHaveLength(2);
      expect(overview.projects[0]!.projectName).toBe("Project Alpha");
      expect(overview.projects[0]!.totalCommittedCost).toBe(3000);
      expect(overview.projects[1]!.projectName).toBe("Project Beta");
      expect(overview.projects[1]!.totalCommittedCost).toBe(8000);
    });
  });
});
