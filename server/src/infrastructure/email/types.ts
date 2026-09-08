/**
 * Provider-agnostic email types.
 * All email providers must implement the `EmailProvider` interface.
 */

export interface EmailMessage {
  /** Recipient email address */
  to: string;
  subject: string;
  /** HTML body */
  html: string;
  /** Plain-text fallback */
  text?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}
