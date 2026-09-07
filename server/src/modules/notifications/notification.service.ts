import type { Notification, NotificationType } from "@prisma/client";
import {
  notificationRepository,
  type NotificationFilters,
} from "./notification.repository.js";
import { emitToUser } from "../../infrastructure/socket/index.js";
import { logger } from "../../infrastructure/logger.js";

export interface SendNotificationInput {
  orgId: string;
  /** The user ID of the notification recipient */
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Optional entity type for deep-linking, e.g. "Invoice", "Task" */
  entityType?: string;
  /** Optional entity ID for deep-linking */
  entityId?: string;
}

export class NotificationService {
  /**
   * Persist a notification to the database and emit it to the
   * recipient's socket room in one atomic operation.
   *
   * The socket emit is best-effort: if the user is offline or the
   * socket server is unavailable, the DB row is already committed
   * and the notification will be visible on next load via the REST API.
   */
  async send(input: SendNotificationInput): Promise<void> {
    const notif = await notificationRepository.create(input);
    try {
      emitToUser(input.userId, "notification", notif);
    } catch (err) {
      // Socket emit failure must never abort the notification — DB write already succeeded
      logger.warn({ err, userId: input.userId, notifId: notif.id }, "Socket emit failed for notification");
    }
  }

  async list(
    userId: string,
    orgId: string,
    filters?: NotificationFilters,
  ): Promise<{ items: Notification[]; total: number }> {
    return notificationRepository.findByUser(userId, orgId, filters);
  }

  async markRead(id: string, userId: string): Promise<void> {
    return notificationRepository.markRead(id, userId);
  }

  async markAllRead(userId: string, orgId: string): Promise<void> {
    return notificationRepository.markAllRead(userId, orgId);
  }

  async countUnread(userId: string, orgId: string): Promise<number> {
    return notificationRepository.countUnread(userId, orgId);
  }
}

export const notificationService = new NotificationService();
