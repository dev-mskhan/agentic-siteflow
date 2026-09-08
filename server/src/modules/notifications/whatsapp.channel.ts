import type { NotificationType } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import { whatsappProvider } from "../../infrastructure/whatsapp/index.js";
import { getWhatsAppTemplate } from "../../infrastructure/whatsapp/templates.js";
import { logger } from "../../infrastructure/logger.js";

/**
 * Normalize a phone number to E.164 format.
 * Strips spaces, dashes, parentheses, and ensures a leading '+'.
 * Returns null if the result doesn't look like a valid E.164 number.
 */
function normalizeToE164(phone: string): string | null {
  const stripped = phone.replace(/[\s\-().]/g, "");
  const e164 = stripped.startsWith("+") ? stripped : `+${stripped}`;
  // E.164: + followed by 7–15 digits
  return /^\+[1-9]\d{6,14}$/.test(e164) ? e164 : null;
}

/**
 * WhatsApp delivery channel for notifications.
 *
 * Responsibilities:
 *  1. Check the user's notification preference for the WhatsApp channel.
 *  2. Resolve the recipient's phone number from the database.
 *  3. Normalize to E.164.
 *  4. Look up the approved Meta template config for this notification type.
 *  5. Dispatch via the configured WhatsApp provider.
 *
 * All errors are caught and logged as warnings — WhatsApp failure must
 * never abort the in-app notification (DB write already committed).
 */
export async function sendWhatsAppNotification(
  userId: string,
  orgId: string,
  type: NotificationType,
  title: string,
  body: string,
  _entityType?: string,
  _entityId?: string,
): Promise<void> {
  try {
    // Lazy import to avoid circular dependency with notification module
    const { notificationPreferenceService } = await import(
      "./notification-preference.service.js"
    );
    const enabled = await notificationPreferenceService.isWhatsAppEnabled(userId, orgId, type);
    if (!enabled) {
      logger.debug({ userId, type }, "WhatsApp notification skipped — preference disabled");
      return;
    }

    // Fetch recipient phone
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });

    if (!user?.phone) {
      logger.debug({ userId }, "WhatsApp notification skipped — no phone number on user");
      return;
    }

    const e164 = normalizeToE164(user.phone);
    if (!e164) {
      logger.warn(
        { userId, phone: user.phone },
        "WhatsApp notification skipped — phone number could not be normalized to E.164",
      );
      return;
    }

    const template = getWhatsAppTemplate(type);
    const components = template.buildComponents(title, body);
    await whatsappProvider.sendTemplate(e164, template.templateName, components);
  } catch (err) {
    logger.warn({ err, userId, type }, "WhatsApp notification dispatch failed");
  }
}
