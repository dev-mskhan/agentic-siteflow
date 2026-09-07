import type { Notification, NotificationType } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";

export interface CreateNotificationInput {
  orgId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
}

export interface NotificationFilters {
  isRead?: boolean;
  limit?: number;
  offset?: number;
}

export class NotificationRepository {
  async create(input: CreateNotificationInput): Promise<Notification> {
    return db.notification.create({
      data: {
        orgId: input.orgId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });
  }

  async findByUser(
    userId: string,
    orgId: string,
    filters: NotificationFilters = {},
  ): Promise<{ items: Notification[]; total: number }> {
    const { isRead, limit = 20, offset = 0 } = filters;

    const where = {
      userId,
      orgId,
      ...(isRead !== undefined ? { isRead } : {}),
    };

    const [items, total] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.notification.count({ where }),
    ]);

    return { items, total };
  }

  async markRead(id: string, userId: string): Promise<void> {
    await db.notification.updateMany({
      where: { id, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string, orgId: string): Promise<void> {
    await db.notification.updateMany({
      where: { userId, orgId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async countUnread(userId: string, orgId: string): Promise<number> {
    return db.notification.count({
      where: { userId, orgId, isRead: false },
    });
  }
}

export const notificationRepository = new NotificationRepository();
