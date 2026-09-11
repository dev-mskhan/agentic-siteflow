import { env } from "../../config/index.js";
import { smtpProvider } from "./smtp.provider.js";
import { noopProvider } from "./noop.provider.js";
import type { EmailProvider } from "./types.js";

export type { EmailProvider };
export type { EmailMessage } from "./types.js";

/**
 * Email provider singleton.
 *
 * Selection is driven by the EMAIL_PROVIDER env var:
 *   "smtp"     → Nodemailer SMTP (works with Mailhog/Mailpit locally)
 *   "sendgrid" → SendGrid HTTP API (loaded lazily to avoid axios peer dep issues)
 *   "none"     → No-op (default — no emails sent, intent logged at debug)
 *
 * SendGrid is loaded lazily so that environments where axios is not installed
 * (e.g. local dev with EMAIL_PROVIDER=none) never import it and do not crash.
 */
async function resolveEmailProvider(): Promise<EmailProvider> {
  switch (env.EMAIL_PROVIDER) {
    case "smtp":
      return smtpProvider;
    case "sendgrid": {
      // Lazy import: only evaluated when sendgrid is the configured provider
      const { sendgridProvider } = await import("./sendgrid.provider.js");
      return sendgridProvider;
    }
    default:
      return noopProvider;
  }
}

/**
 * Resolved singleton — initialised once at server startup.
 * Callers import `getEmailProvider()` and await it.
 *
 * For the common case (none/smtp), this resolves synchronously from cache
 * on every call after the first await.
 */
let _provider: EmailProvider | null = null;

export async function getEmailProvider(): Promise<EmailProvider> {
  if (!_provider) {
    _provider = await resolveEmailProvider();
  }
  return _provider;
}

/**
 * Synchronous accessor — safe after `getEmailProvider()` has been awaited
 * at least once during server bootstrap. Falls back to noop if called before init.
 */
export function emailProvider(): EmailProvider {
  return _provider ?? noopProvider;
}

export function isEmailProviderConfigured(): boolean {
  return env.EMAIL_PROVIDER !== "none";
}
