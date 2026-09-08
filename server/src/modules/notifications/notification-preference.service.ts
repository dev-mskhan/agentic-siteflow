import type { NotificationPreference, NotificationType } from "@prisma/client";
import {
  notificationPreferenceRepository,
  type UpsertPreferenceInput,
} from "./notification-preference.repository.js";

/**
 * Service for notification channel preferences.
 *
 * Default behaviour: if no preference row exists for a (userId, orgId, type)
 * triple, all channels are considered ENABLED (opt-in by default).
 * This means existing users automatically receive all channels unless
 * they explicitly opt out.
 *
 * In-app notifications cannot be disabled; `inAppEnabled` is read-only
 * from the service perspective.
 */
export class NotificationPreferenceService {
  async getPreferences(userId: string, orgId: string): Promise<NotificationPreference[]> {
    return notificationPreferenceRepository.findByUser(userId, orgId);
  }

  async updatePreference(
    userId: string,
    orgId: string,
    type: NotificationType,
    channels: Omit<UpsertPreferenceInput, "inAppEnabled">,
  ): Promise<NotificationPreference> {
    return notificationPreferenceRepository.upsert(userId, orgId, type, channels);
  }

  /**
   * Returns true if the user has email notifications enabled for this type.
   * Defaults to true when no preference row exists (opt-in default).
   */
  async isEmailEnabled(userId: string, orgId: string, type: NotificationType): Promise<boolean> {
    const pref = await notificationPreferenceRepository.findOne(userId, orgId, type);
    return pref?.emailEnabled ?? true;
  }

  /**
   * Returns true if the user has WhatsApp notifications enabled for this type.
   * Defaults to true when no preference row exists (opt-in default).
   */
  async isWhatsAppEnabled(
    userId: string,
    orgId: string,
    type: NotificationType,
  ): Promise<boolean> {
    const pref = await notificationPreferenceRepository.findOne(userId, orgId, type);
    return pref?.whatsappEnabled ?? true;
  }
}

export const notificationPreferenceService = new NotificationPreferenceService();
