import { env } from "../../config/index.js";
import { metaWhatsAppProvider } from "./meta.provider.js";
import { twilioWhatsAppProvider } from "./twilio.provider.js";
import { noopWhatsAppProvider } from "./noop.provider.js";
import type { WhatsAppProvider } from "./types.js";

export type { WhatsAppProvider };
export type { WhatsAppTemplateComponent } from "./types.js";

/**
 * WhatsApp provider singleton.
 *
 * Selection is driven by the WHATSAPP_PROVIDER env var:
 *   "meta"   → WhatsApp Cloud API (Meta Graph API)
 *   "twilio" → Twilio WhatsApp (stub — needs SDK installed to activate)
 *   "none"   → No-op (default — no messages sent, intent logged at debug)
 *
 * Switching provider = change one env var and restart the server.
 */
function resolveWhatsAppProvider(): WhatsAppProvider {
  switch (env.WHATSAPP_PROVIDER) {
    case "meta":
      return metaWhatsAppProvider;
    case "twilio":
      return twilioWhatsAppProvider;
    default:
      return noopWhatsAppProvider;
  }
}

export const whatsappProvider: WhatsAppProvider = resolveWhatsAppProvider();
