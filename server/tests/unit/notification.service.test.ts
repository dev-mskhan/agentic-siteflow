import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = {
  findByDedupeKey: vi.fn(),
  create: vi.fn(),
  createDeliveries: vi.fn(),
};
const enqueueNotificationDeliveries = vi.fn();
const preferenceFindUnique = vi.fn();

vi.mock("../../src/modules/notifications/notification.repository.js", () => ({
  notificationRepository: repository,
}));
vi.mock("../../src/modules/notifications/notification.queue.js", () => ({
  enqueueNotificationDeliveries,
}));
vi.mock("../../src/infrastructure/database/client.js", () => ({
  db: {
    notificationPreference: { findUnique: preferenceFindUnique },
  },
}));

const { NotificationService } = await import(
  "../../src/modules/notifications/notification.service.js"
);

describe("NotificationService durable creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findByDedupeKey.mockResolvedValue(null);
    enqueueNotificationDeliveries.mockResolvedValue(undefined);
    repository.create.mockResolvedValue({
      id: "notification-1",
      orgId: "org-1",
      userId: "user-1",
      type: "TASK_ASSIGNED",
      title: "Assigned",
      body: "Task assigned",
    });
    preferenceFindUnique.mockResolvedValue({
      emailEnabled: true,
      whatsappEnabled: false,
    });
  });

  it("creates one notification and only preference-enabled delivery rows", async () => {
    const service = new NotificationService();
    await service.create({
      orgId: "org-1",
      userId: "user-1",
      type: "TASK_ASSIGNED",
      title: "Assigned",
      body: "Task assigned",
    });

    expect(repository.create).toHaveBeenCalledOnce();
    expect(repository.createDeliveries).toHaveBeenCalledWith(
      "notification-1",
      ["SOCKET", "EMAIL"],
      expect.anything(),
    );
    expect(enqueueNotificationDeliveries).toHaveBeenCalledWith("notification-1");
  });

  it("returns an existing notification for a duplicate dedupe key", async () => {
    const existing = { id: "existing-notification" };
    repository.findByDedupeKey.mockResolvedValue(existing);
    const service = new NotificationService();

    const result = await service.create({
      orgId: "org-1",
      userId: "user-1",
      type: "TASK_OVERDUE",
      title: "Overdue",
      body: "Task overdue",
      dedupeKey: "TASK_OVERDUE:task-1:user-1:2026-09-11",
    });

    expect(result).toBe(existing);
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.createDeliveries).not.toHaveBeenCalled();
  });

  it("keeps notification creation inside the supplied transaction client", async () => {
    const tx = {
      notificationPreference: { findUnique: preferenceFindUnique },
    };
    const service = new NotificationService();

    await service.create(
      {
        orgId: "org-1",
        userId: "user-1",
        type: "TASK_ASSIGNED",
        title: "Assigned",
        body: "Task assigned",
      },
      tx as never,
    );

    expect(repository.create).toHaveBeenCalledWith(expect.anything(), tx);
    expect(repository.createDeliveries).toHaveBeenCalledWith(
      "notification-1",
      ["SOCKET", "EMAIL"],
      tx,
    );
    expect(enqueueNotificationDeliveries).not.toHaveBeenCalled();
  });
});
