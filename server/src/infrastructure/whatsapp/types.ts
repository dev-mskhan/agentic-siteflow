/**
 * Provider-agnostic WhatsApp types.
 *
 * WhatsApp Business API uses pre-approved message templates for
 * business-initiated conversations. The abstraction models this
 * as `sendTemplate(to, templateName, components)`.
 *
 * All providers must implement the `WhatsAppProvider` interface.
 */

export interface WhatsAppTemplateComponent {
  type: "body" | "header" | "button";
  parameters: Array<{ type: "text"; text: string }>;
}

export interface WhatsAppProvider {
  sendTemplate(
    to: string,
    templateName: string,
    components: WhatsAppTemplateComponent[],
  ): Promise<void>;
}
