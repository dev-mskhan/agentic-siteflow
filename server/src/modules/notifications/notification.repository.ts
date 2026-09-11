import type { Notification, NotificationDelivery, NotificationType, Prisma } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";

export interface CreateNotificationInput {
  orgId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  dedupeKey?: string;
}

export interface NotificationFilters {
  isRead?: boolean;
  limit?: number;
  offset?: number;
  withCount?: boolean;
}

type DbClient = typeof db | Prisma.TransactionClient;

export class NotificationRepository {
  async create(input: CreateNotificationInput, client: DbClient = db): Promise<Notification> {
    return client.notification.create({
      data: {
        orgId: input.orgId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
        dedupeKey: input.dedupeKey,
      },
    });
  }

  async findByDedupeKey(
    orgId: string,
    dedupeKey: string,
    client: DbClient = db,
  ): Promise<Notification | null> {
    return client.notification.findUnique({
      where: { orgId_dedupeKey: { orgId, dedupeKey } },
    });
  }

  async createDeliveries(
    notificationId: string,
    channels: Array<"SOCKET" | "EMAIL" | "WHATSAPP">,
    client: DbClient = db,
  ): Promise<void> {
    await client.notificationDelivery.createMany({
      data: channels.map((channel) => ({ notificationId, channel })),
      skipDuplicates: true,
    });
  }

  async listDeliveryJobsForNotification(
    notificationId: string,
  ): Promise<Array<{ id: string; orgId: string }>> {
    const deliveries = await db.notificationDelivery.findMany({
      where: { notificationId },
      select: { id: true, notification: { select: { orgId: true } } },
    });
    return deliveries.map((delivery) => ({ id: delivery.id, orgId: delivery.notification.orgId }));
  }

  async findDelivery(
    id: string,
  ): Promise<(NotificationDelivery & { notification: Notification }) | null> {
    return db.notificationDelivery.findUnique({
      where: { id },
      include: { notification: true },
    });
  }

  async claimDelivery(id: string, now: Date): Promise<boolean> {
    const result = await db.notificationDelivery.updateMany({
      where: {
        id,
        status: { in: ["PENDING", "FAILED"] },
        availableAt: { lte: now },
      },
      data: {
        status: "PROCESSING",
        attempts: { increment: 1 },
        lastAttemptAt: now,
        lastError: null,
      },
    });
    return result.count === 1;
  }

  async markDeliverySent(id: string): Promise<void> {
    await db.notificationDelivery.updateMany({
      where: { id, status: "PROCESSING" },
      data: { status: "SENT", sentAt: new Date(), lastError: null },
    });
  }

  async markDeliveryFailed(
    id: string,
    error: string,
    attempts: number,
    maxAttempts: number,
  ): Promise<void> {
    const dead = attempts >= maxAttempts;
    const backoffMs = Math.min(60 * 60 * 1000, 5 * 1000 * 2 ** Math.max(0, attempts - 1));
    await db.notificationDelivery.updateMany({
      where: { id, status: "PROCESSING" },
      data: {
        status: dead ? "DEAD" : "FAILED",
        availableAt: new Date(Date.now() + backoffMs),
        lastError: error.slice(0, 1000),
      },
    });
  }

  async listDueDeliveryJobs(
    now: Date,
    limit = 100,
  ): Promise<Array<{ id: string; orgId: string }>> {
    const deliveries = await db.notificationDelivery.findMany({
      where: {
        status: { in: ["PENDING", "FAILED"] },
        availableAt: { lte: now },
      },
      select: { id: true, notification: { select: { orgId: true } } },
      orderBy: { availableAt: "asc" },
      take: limit,
    });
    return deliveries.map((delivery) => ({ id: delivery.id, orgId: delivery.notification.orgId }));
  }

  async recoverStaleDeliveries(staleBefore: Date): Promise<number> {
    const result = await db.notificationDelivery.updateMany({
      where: {
        status: "PROCESSING",
        lastAttemptAt: { lt: staleBefore },
      },
      data: {
        status: "FAILED",
        availableAt: new Date(),
        lastError: "Recovered after worker interruption",
      },
    });
    return result.count;
  }

  async getDeliveryStats(orgId: string): Promise<{
    pending: number;
    processing: number;
    failed: number;
    dead: number;
    oldestPendingAt: Date | null;
  }> {
    const [groups, oldest] = await Promise.all([
      db.notificationDelivery.groupBy({
        by: ["status"],
        where: { notification: { orgId } },
        _count: { _all: true },
      }),
      db.notificationDelivery.findFirst({
        where: {
          notification: { orgId },
          status: { in: ["PENDING", "FAILED"] },
        },
        orderBy: { availableAt: "asc" },
        select: { availableAt: true },
      }),
    ]);
    const counts = new Map(groups.map((group) => [group.status, group._count._all]));
    return {
      pending: counts.get("PENDING") ?? 0,
      processing: counts.get("PROCESSING") ?? 0,
      failed: counts.get("FAILED") ?? 0,
      dead: counts.get("DEAD") ?? 0,
      oldestPendingAt: oldest?.availableAt ?? null,
    };
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
