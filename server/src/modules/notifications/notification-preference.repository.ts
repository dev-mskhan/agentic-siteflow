import type { NotificationPreference, NotificationType } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";

export interface UpsertPreferenceInput {
  inAppEnabled?: boolean;
  emailEnabled?: boolean;
  whatsappEnabled?: boolean;
}

/**
 * Repository for NotificationPreference.
 * One row per (userId, orgId, type) triple — created on first explicit update.
 */
export class NotificationPreferenceRepository {
  async findByUser(userId: string, orgId: string): Promise<NotificationPreference[]> {
    return db.notificationPreference.findMany({
      where: { userId, orgId },
      orderBy: { type: "asc" },
    });
  }

  async findOne(
    userId: string,
    orgId: string,
    type: NotificationType,
  ): Promise<NotificationPreference | null> {
    return db.notificationPreference.findUnique({
      where: { userId_orgId_type: { userId, orgId, type } },
    });
  }

  async upsert(
    userId: string,
    orgId: string,
    type: NotificationType,
    channels: UpsertPreferenceInput,
  ): Promise<NotificationPreference> {
    return db.notificationPreference.upsert({
      where: { userId_orgId_type: { userId, orgId, type } },
      create: {
        userId,
        orgId,
        type,
        inAppEnabled: channels.inAppEnabled ?? true,
        emailEnabled: channels.emailEnabled ?? true,
        whatsappEnabled: channels.whatsappEnabled ?? true,
      },
      update: {
        ...(channels.inAppEnabled !== undefined && { inAppEnabled: channels.inAppEnabled }),
        ...(channels.emailEnabled !== undefined && { emailEnabled: channels.emailEnabled }),
        ...(channels.whatsappEnabled !== undefined && { whatsappEnabled: channels.whatsappEnabled }),
      },
    });
  }
}

export const notificationPreferenceRepository = new NotificationPreferenceRepository();
