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
  withCount?: boolean;
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

  /**
   * @deprecated Use listCursor for new consumers — cursor pagination scales better at high offsets.
   */
  async findByUser(
    userId: string,
    orgId: string,
    filters: NotificationFilters = {},
  ): Promise<{ items: Notification[]; total: number | null }> {
    const { isRead, limit = 20, offset = 0, withCount } = filters;

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
      withCount ? db.notification.count({ where }) : Promise.resolve(null),
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

  /** Cursor-based pagination for notifications. Returns items + nextCursor. */
  async listCursor(
    userId: string,
    orgId: string,
    filters: { isRead?: boolean; take?: number; cursor?: string },
  ): Promise<{ items: Notification[]; nextCursor: string | null }> {
    const { isRead, take = 20, cursor } = filters;
    const where = {
      userId,
      orgId,
      ...(isRead !== undefined ? { isRead } : {}),
    };

    const items = await db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: take + 1, // fetch one extra to detect if there's a next page
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasNextPage = items.length > take;
    const pageItems = hasNextPage ? items.slice(0, take) : items;
    const nextCursor = hasNextPage ? (pageItems[pageItems.length - 1]?.id ?? null) : null;

    return { items: pageItems, nextCursor };
  }
}

export const notificationRepository = new NotificationRepository();
