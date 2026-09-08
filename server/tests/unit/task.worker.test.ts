import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";

// ─── Mock dependencies ────────────────────────────────────────────────────────

const mockSend = vi.fn().mockResolvedValue(undefined);
vi.mock("../../src/modules/notifications/notification.service.js", () => ({
  notificationService: { send: mockSend },
}));

const mockOrgFindMany = vi.fn();
const mockTaskFindMany = vi.fn();
vi.mock("../../src/infrastructure/database/client.js", () => ({
  db: {
    organization: { findMany: mockOrgFindMany },
    task: { findMany: mockTaskFindMany },
  },
}));

const { processOverdueTasksJob } = await import(
  "../../src/modules/scheduling/task.worker.js"
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeJob(data: { orgId: string }): Job<{ orgId: string }> {
  return { data } as unknown as Job<{ orgId: string }>;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("processOverdueTasksJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends TASK_OVERDUE notification for each overdue task with assignee", async () => {
    const overdueTasks = [
      {
        id: "task_1",
        name: "Pour foundation",
        plannedEndDate: new Date("2026-09-01"),
        assigneeId: "user_1",
        orgId: "org_1",
      },
      {
        id: "task_2",
        name: "Roofing",
        plannedEndDate: new Date("2026-09-02"),
        assigneeId: "user_2",
        orgId: "org_1",
      },
    ];
    mockTaskFindMany.mockResolvedValue(overdueTasks);

    const result = await processOverdueTasksJob(makeJob({ orgId: "org_1" }));

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org_1",
        userId: "user_1",
        type: "TASK_OVERDUE",
        entityType: "Task",
        entityId: "task_1",
      }),
    );
    expect(result).toEqual({ notified: 2 });
  });

  it("skips tasks with no assignee", async () => {
    mockTaskFindMany.mockResolvedValue([
      {
        id: "task_3",
        name: "Unassigned task",
        plannedEndDate: new Date("2026-09-01"),
        assigneeId: null,
        orgId: "org_1",
      },
    ]);

    const result = await processOverdueTasksJob(makeJob({ orgId: "org_1" }));

    expect(mockSend).not.toHaveBeenCalled();
    expect(result).toEqual({ notified: 0 });
  });

  it("handles orgId='all' by iterating all active orgs", async () => {
    mockOrgFindMany.mockResolvedValue([{ id: "org_1" }, { id: "org_2" }]);
    mockTaskFindMany
      .mockResolvedValueOnce([
        {
          id: "task_1",
          name: "T1",
          plannedEndDate: new Date("2026-09-01"),
          assigneeId: "user_1",
          orgId: "org_1",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "task_2",
          name: "T2",
          plannedEndDate: new Date("2026-09-02"),
          assigneeId: "user_2",
          orgId: "org_2",
        },
      ]);

    const result = await processOverdueTasksJob(makeJob({ orgId: "all" }));

    expect(mockTaskFindMany).toHaveBeenCalledTimes(2);
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ notified: 2 });
  });
});
