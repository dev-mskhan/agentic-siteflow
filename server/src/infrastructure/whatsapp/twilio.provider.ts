import { logger } from "../logger.js";
import type { WhatsAppProvider, WhatsAppTemplateComponent } from "./types.js";

/**
 * Twilio WhatsApp provider — STUB IMPLEMENTATION.
 *
 * This stub logs intent but does not actually send messages.
 * To activate: install the Twilio SDK (`pnpm add twilio`), set
 * WHATSAPP_TWILIO_ACCOUNT_SID, WHATSAPP_TWILIO_AUTH_TOKEN, and
 * WHATSAPP_TWILIO_FROM env vars, then replace the stub body below
 * with the actual Twilio client call.
 *
 * Twilio WhatsApp docs:
 *   https://www.twilio.com/docs/whatsapp/api
 *
 * Example implementation (once Twilio SDK is installed):
 *
 *   import twilio from "twilio";
 *   const client = twilio(accountSid, authToken);
 *   await client.messages.create({
 *     from: `whatsapp:${env.WHATSAPP_TWILIO_FROM}`,
 *     to: `whatsapp:${to}`,
 *     body: components.map(c => c.parameters.map(p => p.text).join(" ")).join("\n"),
 *   });
 */
class TwilioWhatsAppProvider implements WhatsAppProvider {
  sendTemplate(
    to: string,
    templateName: string,
    _components: WhatsAppTemplateComponent[],
  ): Promise<void> {
    logger.info(
      { to, templateName },
      "Twilio WhatsApp provider is a stub — message not sent. Replace stub body to activate.",
    );
    return Promise.resolve();
  }
}

export const twilioWhatsAppProvider = new TwilioWhatsAppProvider();
