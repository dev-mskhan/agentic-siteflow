import { createQueue } from "../../infrastructure/queue/index.js";
import { JOBS, QUEUES } from "../../infrastructure/queue/jobs.js";
import { notificationRepository } from "./notification.repository.js";

export interface NotificationDeliveryJobData {
  deliveryId: string;
  orgId: string;
}

export async function enqueueNotificationDelivery(deliveryId: string, orgId: string): Promise<void> {
  const notificationsQueue = createQueue(QUEUES.NOTIFICATIONS);
  try {
    await notificationsQueue.add(
      JOBS.DISPATCH_NOTIFICATION_DELIVERY,
      { deliveryId, orgId },
      { jobId: `notification-delivery:${deliveryId}` },
    );
  } finally {
    await notificationsQueue.close();
  }
}

export async function enqueueNotificationDeliveries(notificationId: string): Promise<void> {
  const deliveryJobs = await notificationRepository.listDeliveryJobsForNotification(notificationId);
  const notificationsQueue = createQueue(QUEUES.NOTIFICATIONS);
  try {
    await Promise.all(
      deliveryJobs.map(({ id, orgId }) =>
        notificationsQueue.add(
          JOBS.DISPATCH_NOTIFICATION_DELIVERY,
          { deliveryId: id, orgId },
          { jobId: `notification-delivery:${id}` },
        ),
      ),
    );
  } finally {
    await notificationsQueue.close();
  }
}

export async function reconcileNotificationDeliveries(): Promise<number> {
  await notificationRepository.recoverStaleDeliveries(new Date(Date.now() - 10 * 60 * 1000));
  const deliveryJobs = await notificationRepository.listDueDeliveryJobs(new Date());
  const notificationsQueue = createQueue(QUEUES.NOTIFICATIONS);
  try {
    await Promise.all(
      deliveryJobs.map(({ id, orgId }) =>
        notificationsQueue.add(
          JOBS.DISPATCH_NOTIFICATION_DELIVERY,
          { deliveryId: id, orgId },
          { jobId: `notification-delivery:${id}` },
        ),
      ),
    );
  } finally {
    await notificationsQueue.close();
  }
  return deliveryJobs.length;
}
