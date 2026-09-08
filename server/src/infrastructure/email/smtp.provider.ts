import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../../config/index.js";
import { logger } from "../logger.js";
import type { EmailMessage, EmailProvider } from "./types.js";

/**
 * SMTP email provider using Nodemailer.
 *
 * Works with any SMTP server: Gmail, SendGrid SMTP relay, Amazon SES SMTP,
 * or local dev tools like Mailhog / Mailpit (default port 1025, no auth).
 */
class SmtpProvider implements EmailProvider {
  private readonly transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
          : undefined,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      const info = await this.transporter.sendMail({
        from: env.SMTP_FROM,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      logger.debug(
        { messageId: info.messageId, to: message.to, subject: message.subject },
        "SMTP email sent",
      );
    } catch (err) {
      logger.warn({ err, to: message.to, subject: message.subject }, "SMTP email send failed");
    }
  }
}

export const smtpProvider = new SmtpProvider();
