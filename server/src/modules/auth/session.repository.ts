import type { Session } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";

export interface CreateSessionInput {
  userId: string;
  orgId: string;
  refreshToken: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Repository layer for Session model.
 * All session persistence goes through here.
 */
export class SessionRepository {
  async create(input: CreateSessionInput): Promise<Session> {
    return db.session.create({
      data: {
        userId: input.userId,
        orgId: input.orgId,
        refreshToken: input.refreshToken,
        expiresAt: input.expiresAt,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  }

  async findByRefreshToken(token: string): Promise<Session | null> {
    return db.session.findUnique({ where: { refreshToken: token } });
  }

  async revoke(id: string): Promise<void> {
    await db.session.update({
      where: { id },
      data: { isRevoked: true },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await db.session.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });
  }

  async deleteExpired(): Promise<void> {
    await db.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }
}

// Singleton instance
export const sessionRepository = new SessionRepository();
