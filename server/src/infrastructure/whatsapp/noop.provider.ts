import { logger } from "../logger.js";
import type { WhatsAppProvider, WhatsAppTemplateComponent } from "./types.js";

/**
 * No-op WhatsApp provider.
 * Used when WHATSAPP_PROVIDER=none (the default).
 * Logs intent at debug level so you can see what would have been sent.
 */
class NoopWhatsAppProvider implements WhatsAppProvider {
  sendTemplate(
    to: string,
    templateName: string,
    _components: WhatsAppTemplateComponent[],
  ): Promise<void> {
    logger.debug({ to, templateName }, "WhatsApp message skipped (WHATSAPP_PROVIDER=none)");
    return Promise.resolve();
  }
}

export const noopWhatsAppProvider = new NoopWhatsAppProvider();
