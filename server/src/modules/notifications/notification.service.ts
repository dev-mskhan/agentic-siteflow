import { Prisma as PrismaRuntime, type Notification, type NotificationType, type Prisma } from "@prisma/client";
import {
  notificationRepository,
  type NotificationFilters,
} from "./notification.repository.js";
import { db } from "../../infrastructure/database/client.js";
import { enqueueNotificationDeliveries } from "./notification.queue.js";
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
  /** Stable key used to prevent duplicate logical notifications. */
  dedupeKey?: string;
}

export class NotificationService {
  async send(input: SendNotificationInput): Promise<void> {
    await this.create(input);
  }

  async create(
    input: SendNotificationInput,
    tx: Prisma.TransactionClient = db,
  ): Promise<Notification> {
    const existing = input.dedupeKey
      ? await notificationRepository.findByDedupeKey(input.orgId, input.dedupeKey, tx)
      : null;
    if (existing) {
      return existing;
    }

    let notification: Notification;
    try {
      notification = await notificationRepository.create(input, tx);
    } catch (error) {
      if (
        input.dedupeKey &&
        error instanceof PrismaRuntime.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const concurrent = await notificationRepository.findByDedupeKey(
          input.orgId,
          input.dedupeKey,
          tx,
        );
        if (concurrent) return concurrent;
      }
      throw error;
    }
    const preference = await tx.notificationPreference.findUnique({
      where: {
        userId_orgId_type: {
          userId: input.userId,
          orgId: input.orgId,
          type: input.type,
        },
      },
      select: { emailEnabled: true, whatsappEnabled: true },
    });

    const channels: Array<"SOCKET" | "EMAIL" | "WHATSAPP"> = ["SOCKET"];
    if (preference?.emailEnabled ?? true) channels.push("EMAIL");
    if (preference?.whatsappEnabled ?? true) channels.push("WHATSAPP");
    await notificationRepository.createDeliveries(notification.id, channels, tx);

    if (tx === db) {
      void enqueueNotificationDeliveries(notification.id).catch((error: unknown) => {
        logger.warn(
          {
            notificationId: notification.id,
            error: error instanceof Error ? error.message : "unknown error",
          },
          "Notification delivery enqueue failed; reconciliation will retry",
        );
      });
    }
    return notification;
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
