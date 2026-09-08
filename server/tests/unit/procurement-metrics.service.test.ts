import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../src/infrastructure/redis/cache.js", () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  cacheDel: vi.fn(),
  cacheKey: {
    procurementMetrics: (id: string) => `procurement:metrics:${id}`,
    projectFullReport: (id: string) => `report:full:${id}`,
  },
  CACHE_TTL: { REPORT_PROJECT: 300 },
}));

const mockProject = vi.fn();
const mockMR = vi.fn();
const mockPO = vi.fn();
const mockDelivery = vi.fn();

vi.mock("../../src/infrastructure/database/client.js", () => ({
  db: {
    project: { findUnique: mockProject },
    materialRequest: { findMany: mockMR },
    purchaseOrder: { findMany: mockPO },
    delivery: { findMany: mockDelivery },
  },
}));

const { ProcurementMetricsService } = await import(
  "../../src/modules/reporting/procurement-metrics.service.js"
);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ProcurementMetricsService", () => {
  let service: InstanceType<typeof ProcurementMetricsService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProcurementMetricsService();
    mockProject.mockResolvedValue({ id: "proj_1", orgId: "org_1" });
    mockMR.mockResolvedValue([]);
    mockPO.mockResolvedValue([]);
    mockDelivery.mockResolvedValue([]);
  });

  describe("overdue delivery detection", () => {
    it("counts POs with expected delivery in the past that are not RECEIVED or CANCELLED", async () => {
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      mockPO.mockResolvedValue([
        { status: "ISSUED", totalAmount: "10000", expectedDeliveryDate: past },       // overdue
        { status: "PARTIALLY_RECEIVED", totalAmount: "5000", expectedDeliveryDate: past }, // overdue
        { status: "RECEIVED", totalAmount: "8000", expectedDeliveryDate: past },       // not overdue (received)
        { status: "CANCELLED", totalAmount: "2000", expectedDeliveryDate: past },      // not overdue (cancelled)
        { status: "ISSUED", totalAmount: "3000", expectedDeliveryDate: future },       // not overdue (future)
      ]);

      const result = await service.getProcurementMetrics("org_1", "proj_1");

      expect(result.purchaseOrders.overdueDeliveries).toBe(2);
    });
  });

  describe("delivery performance", () => {
    it("counts delayed deliveries and sums delayedDays", async () => {
      mockDelivery.mockResolvedValue([
        {
          status: "DELIVERED",
          isDelayed: true,
          delayedDays: 5,
          expectedDate: new Date(),
          purchaseOrder: { poNumber: "PO-001", vendor: { name: "ABC Supply" } },
        },
        {
          status: "DELIVERED",
          isDelayed: true,
          delayedDays: 12,
          expectedDate: new Date(),
          purchaseOrder: { poNumber: "PO-002", vendor: { name: "XYZ Corp" } },
        },
        {
          status: "DELIVERED",
          isDelayed: false,
          delayedDays: 0,
          expectedDate: new Date(),
          purchaseOrder: { poNumber: "PO-003", vendor: { name: "OnTime Ltd" } },
        },
      ]);

      const result = await service.getProcurementMetrics("org_1", "proj_1");

      expect(result.deliveries.delayed).toBe(2);
      expect(result.deliveries.totalDelayedDays).toBe(17);
      expect(result.deliveries.onTime).toBe(1);
    });

    it("returns top 5 delayed items sorted by delay days descending", async () => {
      const makeDelayed = (poNumber: string, delayedDays: number) => ({
        status: "DELIVERED",
        isDelayed: true,
        delayedDays,
        expectedDate: new Date("2026-09-01"),
        purchaseOrder: { poNumber, vendor: { name: "V" } },
      });

      mockDelivery.mockResolvedValue([
        makeDelayed("PO-1", 3),
        makeDelayed("PO-2", 15),
        makeDelayed("PO-3", 8),
        makeDelayed("PO-4", 20),
        makeDelayed("PO-5", 1),
        makeDelayed("PO-6", 10), // 6th — should be excluded
      ]);

      const result = await service.getProcurementMetrics("org_1", "proj_1");

      expect(result.topDelayedItems).toHaveLength(5);
      expect(result.topDelayedItems[0].poNumber).toBe("PO-4"); // 20 days
      expect(result.topDelayedItems[1].poNumber).toBe("PO-2"); // 15 days
    });
  });

  describe("material request funnel", () => {
    it("correctly categorises material request statuses", async () => {
      mockMR.mockResolvedValue([
        { status: "DRAFT" },
        { status: "SUBMITTED" },
        { status: "SUBMITTED" },
        { status: "APPROVED" },
        { status: "FULFILLED" },
        { status: "PARTIALLY_FULFILLED" },
        { status: "REJECTED" },
        { status: "CANCELLED" },
      ]);

      const result = await service.getProcurementMetrics("org_1", "proj_1");

      expect(result.materialRequests.total).toBe(8);
      expect(result.materialRequests.draft).toBe(1);
      expect(result.materialRequests.pending).toBe(2); // SUBMITTED
      expect(result.materialRequests.approved).toBe(1);
      expect(result.materialRequests.fulfilled).toBe(2); // FULFILLED + PARTIALLY_FULFILLED
      expect(result.materialRequests.rejected).toBe(2); // REJECTED + CANCELLED
    });
  });
});
