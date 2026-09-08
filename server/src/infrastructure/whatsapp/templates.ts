import type { NotificationType } from "@prisma/client";
import type { WhatsAppTemplateComponent } from "./types.js";

export interface WhatsAppTemplateConfig {
  /** The approved Meta Business Manager template name */
  templateName: string;
  /** Build the body component parameters from the notification payload */
  buildComponents(title: string, body: string): WhatsAppTemplateComponent[];
}

/**
 * Maps each NotificationType to its WhatsApp template config.
 *
 * Template names default to the values below. They can be overridden via
 * WHATSAPP_TEMPLATE_<TYPE> env vars (e.g. WHATSAPP_TEMPLATE_INVOICE_OVERDUE)
 * once you have your Meta templates approved under different names.
 *
 * All templates use a single-body component with two text parameters:
 *   {{1}} = title
 *   {{2}} = body message
 *
 * Your Meta template should be defined as:
 *   "{{1}}\n\n{{2}}"
 *
 * This keeps the template contract simple and avoids needing a separate
 * Meta template per notification type.
 */
const DEFAULT_TEMPLATES: Record<NotificationType, string> = {
  INVOICE_OVERDUE: "siteflow_invoice_overdue",
  PAYMENT_APP_PENDING: "siteflow_payment_app_pending",
  COMPLIANCE_EXPIRING: "siteflow_compliance_expiring",
  COMPLIANCE_EXPIRED: "siteflow_compliance_expired",
  RFI_OVERDUE: "siteflow_rfi_overdue",
  SUBMITTAL_OVERDUE: "siteflow_submittal_overdue",
  TASK_ASSIGNED: "siteflow_task_assigned",
  TASK_OVERDUE: "siteflow_task_overdue",
  CHANGE_ORDER_APPROVED: "siteflow_change_order_approved",
  CHANGE_ORDER_REJECTED: "siteflow_change_order_rejected",
  PAYMENT_APP_APPROVED: "siteflow_payment_app_approved",
  PAYMENT_APP_REJECTED: "siteflow_payment_app_rejected",
  SYSTEM: "siteflow_notification",
};

/**
 * Get the WhatsApp template config for a notification type.
 *
 * The template name can be overridden per type via environment variables,
 * which allows teams to use their own approved Meta template names without
 * code changes.
 */
export function getWhatsAppTemplate(type: NotificationType): WhatsAppTemplateConfig {
  // Check for env override: WHATSAPP_TEMPLATE_INVOICE_OVERDUE, etc.
  const envKey = `WHATSAPP_TEMPLATE_${type}`;
  const templateName = process.env[envKey] ?? DEFAULT_TEMPLATES[type] ?? "siteflow_notification";

  return {
    templateName,
    buildComponents(title: string, body: string): WhatsAppTemplateComponent[] {
      return [
        {
          type: "body",
          parameters: [
            { type: "text", text: title },
            { type: "text", text: body },
          ],
        },
      ];
    },
  };
}
