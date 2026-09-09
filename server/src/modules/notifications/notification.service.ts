import type { Notification, NotificationType } from "@prisma/client";
import {
  notificationRepository,
  type NotificationFilters,
} from "./notification.repository.js";
import { emitToUser } from "../../infrastructure/socket/index.js";
import { sendEmailNotification } from "./email.channel.js";
import { sendWhatsAppNotification } from "./whatsapp.channel.js";
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
   * Persist a notification and fan out to all delivery channels.
   *
   * Delivery order:
   *  1. DB persist (source of truth — always happens first)
   *  2. Socket.io emit (real-time, best-effort)
   *  3. Email (preference-gated, best-effort)
   *  4. WhatsApp (preference-gated, best-effort)
   *
   * Channels 2–4 are individually wrapped in try/catch.
   * A failure in any channel never aborts the others or rolls back the DB row.
   */
  async send(input: SendNotificationInput): Promise<void> {
    // 1. Persist — this is the only step that can throw (DB errors bubble up)
    const notif = await notificationRepository.create(input);

    // 2. Real-time socket push
    try {
      emitToUser(input.userId, "notification", notif);
    } catch (err) {
      logger.warn(
        { err, userId: input.userId, notifId: notif.id },
        "Socket emit failed for notification",
      );
    }

    // 3. Email (checks user preference + EMAIL_PROVIDER env internally)
    void sendEmailNotification(
      input.userId,
      input.orgId,
      input.type,
      input.title,
      input.body,
      input.entityType,
      input.entityId,
    ).catch((err: unknown) => {
      logger.warn({ err, userId: input.userId, type: input.type }, "Email channel error");
    });

    // 4. WhatsApp (checks user preference + WHATSAPP_PROVIDER env internally)
    void sendWhatsAppNotification(
      input.userId,
      input.orgId,
      input.type,
      input.title,
      input.body,
      input.entityType,
      input.entityId,
    ).catch((err: unknown) => {
      logger.warn({ err, userId: input.userId, type: input.type }, "WhatsApp channel error");
    });
  }

  async list(
    userId: string,
    orgId: string,
    filters?: NotificationFilters,
  ): Promise<{ items: Notification[]; total: number | null }> {
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
