import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB + cache ─────────────────────────────────────────────────────────

const mockCacheGet = vi.fn().mockResolvedValue(null);
const mockCacheSet = vi.fn().mockResolvedValue(undefined);
vi.mock("../../src/infrastructure/redis/cache.js", () => ({
  cacheGet: mockCacheGet,
  cacheSet: mockCacheSet,
  cacheDel: vi.fn(),
  cacheKey: {
    projectHealth: (id: string) => `health:project:${id}`,
  },
  CACHE_TTL: { REPORT_PROJECT: 300 },
}));

const mockProject = vi.fn();
const mockTask = vi.fn();
const mockIssue = vi.fn();
const mockRfi = vi.fn();
const mockSubmittal = vi.fn();
const mockSafetyIncident = vi.fn();
const mockSafetyAction = vi.fn();

vi.mock("../../src/infrastructure/database/client.js", () => ({
  db: {
    project: { findUnique: mockProject },
    task: { findMany: mockTask },
    issue: { findMany: mockIssue },
    rfi: { findMany: mockRfi },
    submittal: { findMany: mockSubmittal },
    safetyIncident: { findMany: mockSafetyIncident },
    safetyCorrectiveAction: { findMany: mockSafetyAction },
  },
}));

const { ProjectHealthService } = await import(
  "../../src/modules/reporting/project-health.service.js"
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function baseProject() {
  return { id: "proj_1", name: "Test Project", status: "ACTIVE", orgId: "org_1" };
}

function makeTask(overrides = {}) {
  return {
    status: "TODO",
    progress: 0,
    plannedEndDate: null,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ProjectHealthService", () => {
  let service: InstanceType<typeof ProjectHealthService>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProjectHealthService();
    mockProject.mockResolvedValue(baseProject());
    mockIssue.mockResolvedValue([]);
    mockRfi.mockResolvedValue([]);
    mockSubmittal.mockResolvedValue([]);
    mockSafetyIncident.mockResolvedValue([]);
    mockSafetyAction.mockResolvedValue([]);
  });

  describe("health status scoring", () => {
    it("returns GREEN when there are no tasks or issues", async () => {
      mockTask.mockResolvedValue([]);

      const result = await service.getProjectHealthSnapshot("org_1", "proj_1");

      expect(result.healthStatus).toBe("GREEN");
      expect(result.overallHealthScore).toBe(100);
      expect(result.schedule.totalTasks).toBe(0);
    });

    it("returns GREEN when no tasks are overdue", async () => {
      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      mockTask.mockResolvedValue([
        makeTask({ status: "TODO", plannedEndDate: future }),
        makeTask({ status: "IN_PROGRESS", plannedEndDate: future }),
        makeTask({ status: "DONE", plannedEndDate: future }),
      ]);

      const result = await service.getProjectHealthSnapshot("org_1", "proj_1");

      expect(result.healthStatus).toBe("GREEN");
      expect(result.schedule.overdueTasks).toBe(0);
    });

    it("returns AMBER when overdue tasks exceed 20% of total", async () => {
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      // 3 overdue out of 10 = 30% → AMBER
      mockTask.mockResolvedValue([
        makeTask({ status: "TODO", plannedEndDate: past }),
        makeTask({ status: "TODO", plannedEndDate: past }),
        makeTask({ status: "TODO", plannedEndDate: past }),
        ...Array(7).fill(makeTask({ status: "TODO", plannedEndDate: future })),
      ]);

      const result = await service.getProjectHealthSnapshot("org_1", "proj_1");

      expect(result.healthStatus).toBe("AMBER");
    });

    it("returns RED when overdue tasks exceed 40% of total", async () => {
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      // 5 overdue out of 10 = 50% → RED
      mockTask.mockResolvedValue([
        ...Array(5).fill(makeTask({ status: "TODO", plannedEndDate: past })),
        ...Array(5).fill(makeTask({ status: "TODO", plannedEndDate: future })),
      ]);

      const result = await service.getProjectHealthSnapshot("org_1", "proj_1");

      expect(result.healthStatus).toBe("RED");
    });

    it("DONE tasks are never counted as overdue", async () => {
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
      mockTask.mockResolvedValue([
        makeTask({ status: "DONE", plannedEndDate: past }),
        makeTask({ status: "DONE", plannedEndDate: past }),
      ]);

      const result = await service.getProjectHealthSnapshot("org_1", "proj_1");

      expect(result.schedule.overdueTasks).toBe(0);
      expect(result.schedule.completedTasks).toBe(2);
    });

    it("CANCELLED tasks are excluded from totals", async () => {
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
      mockTask.mockResolvedValue([
        makeTask({ status: "CANCELLED", plannedEndDate: past }),
        makeTask({ status: "TODO", progress: 50, plannedEndDate: null }),
      ]);

      const result = await service.getProjectHealthSnapshot("org_1", "proj_1");

      expect(result.schedule.totalTasks).toBe(1); // CANCELLED excluded
      expect(result.schedule.overdueTasks).toBe(0);
    });

    it("correctly computes completionPercent and avgProgress", async () => {
      mockTask.mockResolvedValue([
        makeTask({ status: "DONE", progress: 100 }),
        makeTask({ status: "IN_PROGRESS", progress: 50 }),
        makeTask({ status: "TODO", progress: 0 }),
        makeTask({ status: "TODO", progress: 0 }),
      ]);

      const result = await service.getProjectHealthSnapshot("org_1", "proj_1");

      expect(result.schedule.completedTasks).toBe(1);
      expect(result.schedule.completionPercent).toBe(25); // 1/4
      expect(result.schedule.avgProgress).toBe(38); // (100+50+0+0)/4 = 37.5 → 38
    });
  });

  it("throws NotFoundError when project is not in org", async () => {
    mockProject.mockResolvedValue(null);
    mockTask.mockResolvedValue([]);

    await expect(
      service.getProjectHealthSnapshot("org_1", "proj_999"),
    ).rejects.toThrow("Project not found");
  });

  it("returns cached result without querying DB", async () => {
    const cached = { projectId: "proj_1", healthStatus: "GREEN", computedAt: new Date().toISOString() };
    mockCacheGet.mockResolvedValue(cached);

    const result = await service.getProjectHealthSnapshot("org_1", "proj_1");

    expect(result).toBe(cached);
    expect(mockProject).not.toHaveBeenCalled();
    expect(mockTask).not.toHaveBeenCalled();
  });
});
