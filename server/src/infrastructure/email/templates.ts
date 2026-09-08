import type { NotificationType } from "@prisma/client";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Subject prefix map for each notification type.
 * This drives email subject lines without needing a per-type template file.
 */
const SUBJECT_MAP: Record<NotificationType, string> = {
  INVOICE_OVERDUE: "Action Required: Invoice Overdue",
  PAYMENT_APP_PENDING: "Reminder: Payment Application Awaiting Review",
  COMPLIANCE_EXPIRING: "Alert: Compliance Record Expiring Soon",
  COMPLIANCE_EXPIRED: "Alert: Compliance Record Expired",
  RFI_OVERDUE: "Overdue: RFI Requires Attention",
  SUBMITTAL_OVERDUE: "Overdue: Submittal Requires Review",
  TASK_ASSIGNED: "Task Assigned to You",
  TASK_OVERDUE: "Overdue: Task Past Due Date",
  CHANGE_ORDER_APPROVED: "Change Order Approved",
  CHANGE_ORDER_REJECTED: "Change Order Rejected",
  PAYMENT_APP_APPROVED: "Payment Application Approved",
  PAYMENT_APP_REJECTED: "Payment Application Rejected",
  SYSTEM: "SiteFlow Notification",
};

/**
 * Render a branded email from a notification payload.
 *
 * Uses plain TypeScript string interpolation — no external template engine.
 * The HTML is intentionally minimal for maximum inbox compatibility.
 */
export function renderEmailTemplate(
  type: NotificationType,
  title: string,
  body: string,
  entityType?: string,
  entityId?: string,
): RenderedEmail {
  const subject = SUBJECT_MAP[type] ?? "SiteFlow Notification";

  // Build a basic deep-link placeholder. In production this would use
  // the configured app URL to generate a real link.
  const deepLinkSection =
    entityType && entityId
      ? `
        <p style="margin: 16px 0;">
          <strong>Related:</strong> ${entityType} <code>${entityId}</code>
        </p>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color: #1a56db; padding: 24px 32px;">
              <span style="color: #ffffff; font-size: 20px; font-weight: bold; letter-spacing: 0.5px;">
                SiteFlow
              </span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 12px 0; font-size: 20px; color: #111827;">
                ${escapeHtml(title)}
              </h1>
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #374151; line-height: 1.6;">
                ${escapeHtml(body)}
              </p>
              ${deepLinkSection}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
                This notification was sent by SiteFlow. You can manage your notification preferences in your account settings.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `SiteFlow Notification`,
    `${"─".repeat(40)}`,
    title,
    ``,
    body,
    entityType && entityId ? `Related: ${entityType} ${entityId}` : "",
    ``,
    `─`.repeat(40),
    `Manage notification preferences in your SiteFlow account settings.`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return { subject, html, text };
}

/** Minimal HTML escaping to prevent XSS in email content. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
