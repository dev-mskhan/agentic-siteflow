import { env } from "../../config/index.js";
import { logger } from "../logger.js";
import type { WhatsAppProvider, WhatsAppTemplateComponent } from "./types.js";

/**
 * WhatsApp Cloud API (Meta) provider.
 *
 * Uses the Meta Graph API to send template messages.
 * Requires WHATSAPP_META_TOKEN and WHATSAPP_META_PHONE_NUMBER_ID env vars.
 *
 * Documentation:
 *   https://developers.facebook.com/docs/whatsapp/cloud-api/messages/template-messages
 *
 * Uses native Node fetch (available since Node 18). No extra HTTP library needed.
 */
class MetaWhatsAppProvider implements WhatsAppProvider {
  private readonly initialized: boolean;

  constructor() {
    if (env.WHATSAPP_META_TOKEN && env.WHATSAPP_META_PHONE_NUMBER_ID) {
      this.initialized = true;
    } else {
      this.initialized = false;
      logger.warn(
        "Meta WhatsApp provider selected but WHATSAPP_META_TOKEN or WHATSAPP_META_PHONE_NUMBER_ID is not set — messages will be skipped",
      );
    }
  }

  async sendTemplate(
    to: string,
    templateName: string,
    components: WhatsAppTemplateComponent[],
  ): Promise<void> {
    if (!this.initialized) return;

    const url = `https://graph.facebook.com/${env.WHATSAPP_META_API_VERSION}/${env.WHATSAPP_META_PHONE_NUMBER_ID}/messages`;

    const body = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: "en_US" },
        components,
      },
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_META_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.warn(
          { to, templateName, status: response.status, errorBody },
          "Meta WhatsApp API returned non-OK response",
        );
        return;
      }

      logger.debug({ to, templateName }, "Meta WhatsApp template message sent");
    } catch (err) {
      logger.warn({ err, to, templateName }, "Meta WhatsApp send failed");
    }
  }
}

export const metaWhatsAppProvider = new MetaWhatsAppProvider();
