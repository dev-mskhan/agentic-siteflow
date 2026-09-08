import sgMail from "@sendgrid/mail";
import { env } from "../../config/index.js";
import { logger } from "../logger.js";
import type { EmailMessage, EmailProvider } from "./types.js";

/**
 * SendGrid email provider.
 *
 * Requires SENDGRID_API_KEY and SENDGRID_FROM env vars.
 * Falls back to noop behavior (with a warning) if they are not set.
 */
class SendGridProvider implements EmailProvider {
  private readonly initialized: boolean;

  constructor() {
    if (env.SENDGRID_API_KEY && env.SENDGRID_FROM) {
      sgMail.setApiKey(env.SENDGRID_API_KEY);
      this.initialized = true;
    } else {
      this.initialized = false;
      logger.warn(
        "SendGrid provider selected but SENDGRID_API_KEY or SENDGRID_FROM is not set — emails will be skipped",
      );
    }
  }

  async send(message: EmailMessage): Promise<void> {
    if (!this.initialized) return;

    try {
      await sgMail.send({
        from: env.SENDGRID_FROM!,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      logger.debug({ to: message.to, subject: message.subject }, "SendGrid email sent");
    } catch (err) {
      logger.warn({ err, to: message.to, subject: message.subject }, "SendGrid email send failed");
    }
  }
}

export const sendgridProvider = new SendGridProvider();
