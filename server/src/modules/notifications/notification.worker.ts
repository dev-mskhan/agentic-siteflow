import type { Job, Worker } from "bullmq";
import { createWorker } from "../../infrastructure/queue/index.js";
import { JOBS, QUEUES } from "../../infrastructure/queue/jobs.js";
import { emitToUser } from "../../infrastructure/socket/index.js";
import { logger } from "../../infrastructure/logger.js";
import { sendEmailNotification } from "./email.channel.js";
import { sendWhatsAppNotification } from "./whatsapp.channel.js";
import {
  notificationRepository,
  type NotificationRepository,
} from "./notification.repository.js";
import {
  enqueueNotificationDelivery,
  reconcileNotificationDeliveries,
  type NotificationDeliveryJobData,
} from "./notification.queue.js";
import { NonRetryableNotificationError } from "./notification.errors.js";

const MAX_DELIVERY_ATTEMPTS = 5;

export async function processDelivery(
  deliveryId: string,
  repository: NotificationRepository,
): Promise<void> {
  const existing = await repository.findDelivery(deliveryId);
  if (!existing || existing.status === "SENT" || existing.status === "DEAD") return;

  const claimed = await repository.claimDelivery(deliveryId, new Date());
  if (!claimed) return;

  const delivery = await repository.findDelivery(deliveryId);
  if (!delivery) return;

  try {
    if (delivery.channel === "SOCKET") {
      emitToUser(delivery.notification.userId, "notification", delivery.notification);
    } else if (delivery.channel === "EMAIL") {
      await sendEmailNotification(
        delivery.notification.userId,
        delivery.notification.orgId,
        delivery.notification.type,
        delivery.notification.title,
        delivery.notification.body,
        delivery.notification.entityType ?? undefined,
        delivery.notification.entityId ?? undefined,
      );
    } else {
      await sendWhatsAppNotification(
        delivery.notification.userId,
        delivery.notification.orgId,
        delivery.notification.type,
        delivery.notification.title,
        delivery.notification.body,
        delivery.notification.entityType ?? undefined,
        delivery.notification.entityId ?? undefined,
      );
    }
    await repository.markDeliverySent(deliveryId);
    logger.info(
      {
        notificationId: delivery.notificationId,
        deliveryId,
        orgId: delivery.notification.orgId,
        channel: delivery.channel,
        attempt: delivery.attempts,
        outcome: "sent",
      },
      "Notification delivery completed",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await repository.markDeliveryFailed(
      deliveryId,
      message,
      delivery.attempts,
      error instanceof NonRetryableNotificationError ? delivery.attempts : MAX_DELIVERY_ATTEMPTS,
    );
    logger.warn(
      {
        notificationId: delivery.notificationId,
        deliveryId,
        orgId: delivery.notification.orgId,
        channel: delivery.channel,
        attempt: delivery.attempts,
        error: message,
      },
      "Notification delivery failed",
    );
  }
}

export async function processJob(
  job: Job<NotificationDeliveryJobData | undefined>,
): Promise<void> {
  if (job.name === JOBS.RECONCILE_NOTIFICATION_DELIVERIES) {
    await reconcileNotificationDeliveries();
    return;
  }
  if (job.name === JOBS.DISPATCH_NOTIFICATION_DELIVERY && job.data?.deliveryId) {
    await processDelivery(job.data.deliveryId, notificationRepository);
  }
}

export function startNotificationWorker(): Worker {
  return createWorker(QUEUES.NOTIFICATIONS, processJob);
}

export { enqueueNotificationDelivery };
