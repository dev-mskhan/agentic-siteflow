import type { NotificationType } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import { emailProvider } from "../../infrastructure/email/index.js";
import { renderEmailTemplate } from "../../infrastructure/email/templates.js";
import { logger } from "../../infrastructure/logger.js";

/**
 * Email delivery channel for notifications.
 *
 * Responsibilities:
 *  1. Resolve the recipient's email address from the database.
 *  2. Check the user's notification preference for the email channel.
 *  3. Render the email template.
 *  4. Dispatch via the configured email provider.
 *
 * All errors are caught and logged as warnings — email failure must never
 * abort the in-app notification (DB write already committed at call time).
 *
 * The preference check is delegated to the notificationPreferenceService
 * which is imported lazily to avoid a circular dependency with the
 * notification module index.
 */
export async function sendEmailNotification(
  userId: string,
  orgId: string,
  type: NotificationType,
  title: string,
  body: string,
  entityType?: string,
  entityId?: string,
): Promise<void> {
  try {
    // Lazy import avoids circular dependency: notification.service → email.channel → preference.service → notification-preference.repository
    const { notificationPreferenceService } = await import(
      "./notification-preference.service.js"
    );
    const enabled = await notificationPreferenceService.isEmailEnabled(userId, orgId, type);
    if (!enabled) {
      logger.debug({ userId, type }, "Email notification skipped — preference disabled");
      return;
    }

    // Fetch recipient email
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user?.email) {
      logger.debug({ userId }, "Email notification skipped — no email address on user");
      return;
    }

    const { subject, html, text } = renderEmailTemplate(type, title, body, entityType, entityId);
    await emailProvider().send({ to: user.email, subject, html, text });
  } catch (err) {
    logger.warn({ err, userId, type }, "Email notification dispatch failed");
  }
}
