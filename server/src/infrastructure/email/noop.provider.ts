import { logger } from "../logger.js";
import type { EmailMessage, EmailProvider } from "./types.js";

/**
 * No-op email provider.
 * Used when EMAIL_PROVIDER=none (default for local development without a mail server).
 * Logs intent at debug level so you can see what would have been sent.
 */
class NoopProvider implements EmailProvider {
  send(message: EmailMessage): Promise<void> {
    logger.debug(
      { to: message.to, subject: message.subject },
      "Email skipped (EMAIL_PROVIDER=none)",
    );
    return Promise.resolve();
  }
}

export const noopProvider = new NoopProvider();
