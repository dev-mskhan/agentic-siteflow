import type { AuditLog, Prisma } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type { AuditEntry } from "./audit.types.js";

/**
 * Repository layer for AuditLog model.
 * Append-only — never updates or deletes.
 */
export class AuditRepository {
  async create(entry: AuditEntry): Promise<AuditLog> {
    return db.auditLog.create({
      data: {
        orgId: entry.orgId,
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        oldValue: entry.oldValue as Prisma.InputJsonValue | undefined,
        newValue: entry.newValue as Prisma.InputJsonValue | undefined,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    });
  }

  async findByOrg(orgId: string, limit = 50): Promise<AuditLog[]> {
    return db.auditLog.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async findByUser(userId: string, limit = 50): Promise<AuditLog[]> {
    return db.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async findByEntity(
    entity: string,
    entityId: string,
    limit = 50,
    offset = 0,
    orgId?: string,
  ): Promise<AuditLog[]> {
    return db.auditLog.findMany({
      where: { entity, entityId, ...(orgId ? { orgId } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  async findByEntityCursor(
    entity: string,
    entityId: string,
    options: { limit?: number; cursor?: string; orgId?: string },
  ): Promise<{ items: AuditLog[]; nextCursor: string | null }> {
    const { limit = 50, cursor, orgId } = options;
    const where = { entity, entityId, ...(orgId ? { orgId } : {}) };

    const items = await db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasNextPage = items.length > limit;
    const pageItems = hasNextPage ? items.slice(0, limit) : items;
    const nextCursor = hasNextPage ? (pageItems[pageItems.length - 1]?.id ?? null) : null;

    return { items: pageItems, nextCursor };
  }
}

// Singleton instance
export const auditRepository = new AuditRepository();
