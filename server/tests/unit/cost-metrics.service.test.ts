import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../src/infrastructure/redis/cache.js", () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  cacheDel: vi.fn(),
  cacheKey: {
    costMetrics: (id: string) => `cost:metrics:${id}`,
    projectFullReport: (id: string) => `report:full:${id}`,
    orgDashboard: (id: string) => `exec:dashboard:${id}`,
  },
  CACHE_TTL: { REPORT_ORG: 180 },
}));

const mockProject = vi.fn();
const mockChangeOrder = vi.fn();
const mockPayApp = vi.fn();
const mockPayment = vi.fn();

vi.mock("../../src/infrastructure/database/client.js", () => ({
  db: {
    project: { findUnique: mockProject },
    changeOrder: { findMany: mockChangeOrder },
    paymentApplication: { findMany: mockPayApp },
    payment: { findMany: mockPayment },
  },
}));

// financial-variance service returns the budget block
const mockFinancialVarianceService = {
  getProjectCommercialOverview: vi.fn(),
};
vi.mock("../../src/modules/commercial/financial-variance.service.js", () => ({
  financialVarianceService: mockFinancialVarianceService,
}));

const { CostMetricsService } = await import(
  "../../src/modules/reporting/cost-metrics.service.js"
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function baseOverview() {
  return {
    totalOriginalBudget: 100_000,
    totalApprovedChanges: 10_000,
    totalRevisedBudget: 110_000,
    totalCommittedCost: 80_000,
    totalActualCost: 60_000,
    totalForecastCost: 115_000,
    totalVariance: -5_000,
    isOverBudget: true,
    burnRate: 500,
    costCodeBreakdown: [],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CostMetricsService", () => {
  let service: InstanceType<typeof CostMetricsService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CostMetricsService();
    mockProject.mockResolvedValue({
      id: "proj_1",
      orgId: "org_1",
      currency: "USD",
      contractValue: "200000",
    });
    mockFinancialVarianceService.getProjectCommercialOverview.mockResolvedValue(baseOverview());
    mockChangeOrder.mockResolvedValue([]);
    mockPayApp.mockResolvedValue([]);
    mockPayment.mockResolvedValue([]);
  });

  describe("billing calculations", () => {
    it("correctly computes billingPercent from approved payment apps", async () => {
      mockPayApp.mockResolvedValue([
        { currentPaymentDue: "50000", retainageAmount: "5000" },
        { currentPaymentDue: "30000", retainageAmount: "3000" },
      ]);

      const result = await service.getCostMetrics("org_1", "proj_1");

      // totalBilled = 80_000, contractValue = 200_000 → 40%
      expect(result.billing.totalBilled).toBe(80_000);
      expect(result.billing.billingPercent).toBe(40);
      expect(result.billing.retainageWithheld).toBe(8_000);
    });

    it("correctly computes outstandingReceivables = totalBilled - totalPaid", async () => {
      mockPayApp.mockResolvedValue([
        { currentPaymentDue: "80000", retainageAmount: "0" },
      ]);
      mockPayment.mockResolvedValue([
        { amount: "50000" },
      ]);

      const result = await service.getCostMetrics("org_1", "proj_1");

      expect(result.billing.outstandingReceivables).toBe(30_000);
      expect(result.billing.totalPaid).toBe(50_000);
    });

    it("returns billingPercent=0 when contractValue is 0", async () => {
      mockProject.mockResolvedValue({
        id: "proj_1", orgId: "org_1", currency: "USD", contractValue: null,
      });

      const result = await service.getCostMetrics("org_1", "proj_1");

      expect(result.billing.billingPercent).toBe(0);
      expect(result.billing.contractValue).toBe(0);
    });
  });

  describe("change order summary", () => {
    it("counts approved and pending change orders separately", async () => {
      mockChangeOrder.mockResolvedValue([
        { status: "APPROVED", costDelta: "10000" },
        { status: "APPROVED", costDelta: "5000" },
        { status: "SUBMITTED", costDelta: "8000" },
        { status: "DRAFT", costDelta: "2000" },
      ]);

      const result = await service.getCostMetrics("org_1", "proj_1");

      expect(result.changeOrders.approved).toBe(2);
      expect(result.changeOrders.pending).toBe(1); // SUBMITTED only
      expect(result.changeOrders.totalApprovedValue).toBe(15_000);
      expect(result.changeOrders.totalPendingValue).toBe(8_000);
      expect(result.changeOrders.total).toBe(4);
    });
  });

  it("maps budget block from financialVarianceService", async () => {
    const result = await service.getCostMetrics("org_1", "proj_1");

    expect(result.budget.original).toBe(100_000);
    expect(result.budget.revised).toBe(110_000);
    expect(result.budget.isOverBudget).toBe(true);
    expect(result.budget.burnRate).toBe(500);
  });
});
