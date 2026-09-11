import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationRepository } from "../../src/modules/notifications/notification.repository.js";
import { NonRetryableNotificationError } from "../../src/modules/notifications/notification.errors.js";

const emitToUser = vi.fn();
const sendEmailNotification = vi.fn();
const sendWhatsAppNotification = vi.fn();

vi.mock("../../src/infrastructure/socket/index.js", () => ({ emitToUser }));
vi.mock("../../src/modules/notifications/email.channel.js", () => ({
  sendEmailNotification,
}));
vi.mock("../../src/modules/notifications/whatsapp.channel.js", () => ({
  sendWhatsAppNotification,
}));
vi.mock("../../src/infrastructure/queue/index.js", () => ({
  createWorker: vi.fn(),
}));

const { processDelivery } = await import(
  "../../src/modules/notifications/notification.worker.js"
);

function makeDelivery(channel: "SOCKET" | "EMAIL" | "WHATSAPP") {
  return {
    id: "delivery-1",
    notificationId: "notification-1",
    channel,
    status: "PENDING",
    attempts: 0,
    notification: {
      id: "notification-1",
      orgId: "org-1",
      userId: "user-1",
      type: "TASK_ASSIGNED",
      title: "Assigned",
      body: "Task assigned",
      entityType: "Task",
      entityId: "task-1",
    },
  };
}

describe("notification worker delivery lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks a successful socket delivery as sent", async () => {
    const repository = {
      findDelivery: vi.fn()
        .mockResolvedValueOnce(makeDelivery("SOCKET"))
        .mockResolvedValueOnce({ ...makeDelivery("SOCKET"), status: "PROCESSING", attempts: 1 }),
      claimDelivery: vi.fn().mockResolvedValue(true),
      markDeliverySent: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotificationRepository;

    await processDelivery("delivery-1", repository);

    expect(emitToUser).toHaveBeenCalledWith("user-1", "notification", expect.anything());
    expect(repository.markDeliverySent).toHaveBeenCalledWith("delivery-1");
  });

  it("marks a non-retryable channel failure as dead", async () => {
    const repository = {
      findDelivery: vi.fn()
        .mockResolvedValueOnce(makeDelivery("EMAIL"))
        .mockResolvedValueOnce({ ...makeDelivery("EMAIL"), status: "PROCESSING", attempts: 1 }),
      claimDelivery: vi.fn().mockResolvedValue(true),
      markDeliveryFailed: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotificationRepository;
    sendEmailNotification.mockRejectedValueOnce(
      new NonRetryableNotificationError("Recipient has no email address"),
    );

    await processDelivery("delivery-1", repository);

    expect(repository.markDeliveryFailed).toHaveBeenCalledWith(
      "delivery-1",
      "Recipient has no email address",
      1,
      1,
    );
  });

  it("does not process already terminal delivery rows", async () => {
    const repository = {
      findDelivery: vi.fn().mockResolvedValue({ ...makeDelivery("SOCKET"), status: "SENT" }),
      claimDelivery: vi.fn(),
    } as unknown as NotificationRepository;

    await processDelivery("delivery-1", repository);

    expect(repository.claimDelivery).not.toHaveBeenCalled();
    expect(emitToUser).not.toHaveBeenCalled();
  });

  it("schedules a retry for a transient channel failure", async () => {
    const repository = {
      findDelivery: vi.fn()
        .mockResolvedValueOnce(makeDelivery("EMAIL"))
        .mockResolvedValueOnce({ ...makeDelivery("EMAIL"), status: "PROCESSING", attempts: 1 }),
      claimDelivery: vi.fn().mockResolvedValue(true),
      markDeliveryFailed: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotificationRepository;
    sendEmailNotification.mockRejectedValueOnce(new Error("provider timeout"));

    await processDelivery("delivery-1", repository);

    expect(repository.markDeliveryFailed).toHaveBeenCalledWith(
      "delivery-1",
      "provider timeout",
      1,
      5,
    );
  });

  it("marks the final transient attempt as dead", async () => {
    const repository = {
      findDelivery: vi.fn()
        .mockResolvedValueOnce({ ...makeDelivery("EMAIL"), attempts: 4 })
        .mockResolvedValueOnce({ ...makeDelivery("EMAIL"), status: "PROCESSING", attempts: 5 }),
      claimDelivery: vi.fn().mockResolvedValue(true),
      markDeliveryFailed: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotificationRepository;
    sendEmailNotification.mockRejectedValueOnce(new Error("provider unavailable"));

    await processDelivery("delivery-1", repository);

    expect(repository.markDeliveryFailed).toHaveBeenCalledWith(
      "delivery-1",
      "provider unavailable",
      5,
      5,
    );
  });
});
