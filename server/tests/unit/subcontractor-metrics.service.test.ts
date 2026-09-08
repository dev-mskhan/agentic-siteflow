import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../src/infrastructure/redis/cache.js", () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  cacheDel: vi.fn(),
  cacheKey: {
    subcontractorMetrics: (id: string) => `sub:metrics:${id}`,
    projectFullReport: (id: string) => `report:full:${id}`,
  },
  CACHE_TTL: { REPORT_PROJECT: 300 },
}));

const mockProject = vi.fn();
const mockContract = vi.fn();
const mockSubcontractor = vi.fn();
const mockTask = vi.fn();
const mockPayment = vi.fn();
const mockRetainage = vi.fn();

vi.mock("../../src/infrastructure/database/client.js", () => ({
  db: {
    project: { findUnique: mockProject },
    subcontractorContract: { findMany: mockContract },
    subcontractor: { findMany: mockSubcontractor },
    task: { findMany: mockTask },
    payment: { findMany: mockPayment },
    retainageRelease: { findMany: mockRetainage },
  },
}));

const { SubcontractorMetricsService } = await import(
  "../../src/modules/reporting/subcontractor-metrics.service.js"
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSub(id: string, overrides = {}) {
  return {
    id,
    companyName: `Sub ${id}`,
    trade: "Concrete",
    isCompliant: true,
    insuranceExpiry: null,
    licenseExpiry: null,
    rating: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SubcontractorMetricsService", () => {
  let service: InstanceType<typeof SubcontractorMetricsService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SubcontractorMetricsService();
    mockProject.mockResolvedValue({ id: "proj_1", orgId: "org_1" });
    mockContract.mockResolvedValue([]);
    mockSubcontractor.mockResolvedValue([]);
    mockTask.mockResolvedValue([]);
    mockPayment.mockResolvedValue([]);
    mockRetainage.mockResolvedValue([]);
  });

  describe("compliance expiry detection", () => {
    it("identifies subcontractors with insurance expiring within 30 days", async () => {
      const in15Days = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      const in45Days = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

      mockContract.mockResolvedValue([
        { id: "c1", status: "ACTIVE", contractValue: "10000", subcontractorId: "sub_1" },
        { id: "c2", status: "ACTIVE", contractValue: "5000", subcontractorId: "sub_2" },
        { id: "c3", status: "ACTIVE", contractValue: "8000", subcontractorId: "sub_3" },
      ]);
      mockSubcontractor.mockResolvedValue([
        makeSub("sub_1", { insuranceExpiry: in15Days }),   // expiring soon ✓
        makeSub("sub_2", { insuranceExpiry: in45Days }),   // outside window
        makeSub("sub_3", { insuranceExpiry: yesterday }), // already expired
      ]);

      const result = await service.getSubcontractorMetrics("org_1", "proj_1");

      expect(result.complianceStatus.expiringInsurance).toHaveLength(1);
      expect(result.complianceStatus.expiringInsurance[0].id).toBe("sub_1");
    });

    it("counts non-compliant subcontractors", async () => {
      mockContract.mockResolvedValue([
        { id: "c1", status: "ACTIVE", contractValue: "10000", subcontractorId: "sub_1" },
        { id: "c2", status: "ACTIVE", contractValue: "5000", subcontractorId: "sub_2" },
      ]);
      mockSubcontractor.mockResolvedValue([
        makeSub("sub_1", { isCompliant: true }),
        makeSub("sub_2", { isCompliant: false }),
      ]);

      const result = await service.getSubcontractorMetrics("org_1", "proj_1");

      expect(result.complianceStatus.compliantCount).toBe(1);
      expect(result.complianceStatus.nonCompliantCount).toBe(1);
    });
  });

  describe("task performance", () => {
    it("correctly classifies completed on-time vs late", async () => {
      const past = new Date("2026-09-01");
      const afterDeadline = new Date("2026-09-05");
      const onTime = new Date("2026-08-30");

      mockContract.mockResolvedValue([
        { id: "c1", status: "ACTIVE", contractValue: "10000", subcontractorId: "sub_1" },
      ]);
      mockSubcontractor.mockResolvedValue([makeSub("sub_1")]);
      mockTask.mockResolvedValue([
        { id: "t1", status: "DONE", subcontractorId: "sub_1", plannedEndDate: past, actualEndDate: onTime },      // on time
        { id: "t2", status: "DONE", subcontractorId: "sub_1", plannedEndDate: past, actualEndDate: afterDeadline }, // late
        { id: "t3", status: "IN_PROGRESS", subcontractorId: "sub_1", plannedEndDate: new Date("2026-09-01"), actualEndDate: null }, // overdue (past date)
      ]);

      const result = await service.getSubcontractorMetrics("org_1", "proj_1");

      expect(result.taskPerformance.completedOnTime).toBe(1);
      expect(result.taskPerformance.completedLate).toBe(1);
      expect(result.taskPerformance.currentlyOverdue).toBe(1);
    });
  });

  describe("bySubcontractor rollup", () => {
    it("builds a per-subcontractor summary sorted by contract value descending", async () => {
      mockContract.mockResolvedValue([
        { id: "c1", status: "ACTIVE", contractValue: "50000", subcontractorId: "sub_1" },
        { id: "c2", status: "ACTIVE", contractValue: "120000", subcontractorId: "sub_2" },
      ]);
      mockSubcontractor.mockResolvedValue([
        makeSub("sub_1", { rating: "4.2" }),
        makeSub("sub_2", { rating: null }),
      ]);

      const result = await service.getSubcontractorMetrics("org_1", "proj_1");

      expect(result.bySubcontractor).toHaveLength(2);
      expect(result.bySubcontractor[0].subcontractorId).toBe("sub_2"); // higher value first
      expect(result.bySubcontractor[0].contractValue).toBe(120_000);
      expect(result.bySubcontractor[1].rating).toBe(4.2);
    });
  });
});
