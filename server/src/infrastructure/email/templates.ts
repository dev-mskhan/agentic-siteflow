import type { NotificationType } from "@prisma/client";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// ─── Auth Email Templates ─────────────────────────────────────────────────────

/**
 * Password reset email.
 * The reset link expires in 1 hour — stated explicitly in the email.
 */
export function renderPasswordResetEmail(firstName: string, resetUrl: string): RenderedEmail {
  const subject = "Reset your SiteFlow password";

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
          <tr>
            <td style="background-color: #1a56db; padding: 24px 32px;">
              <span style="color: #ffffff; font-size: 20px; font-weight: bold; letter-spacing: 0.5px;">SiteFlow</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 12px 0; font-size: 20px; color: #111827;">Reset your password</h1>
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #374151; line-height: 1.6;">
                Hi ${escapeHtml(firstName)},
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; color: #374151; line-height: 1.6;">
                We received a request to reset your SiteFlow password. Click the button below to choose a new password.
                This link expires in <strong>1 hour</strong>.
              </p>
              <p style="margin: 0 0 24px 0;">
                <a href="${escapeHtml(resetUrl)}"
                   style="display: inline-block; background-color: #1a56db; color: #ffffff; font-size: 15px;
                          font-weight: bold; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
                  Reset password
                </a>
              </p>
              <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.6;">
                If you did not request a password reset, you can safely ignore this email.
                Your password will not change.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
                If the button above doesn't work, copy and paste this link into your browser:<br />
                <a href="${escapeHtml(resetUrl)}" style="color: #1a56db; word-break: break-all;">${escapeHtml(resetUrl)}</a>
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
    `SiteFlow — Reset your password`,
    `${"─".repeat(40)}`,
    `Hi ${firstName},`,
    ``,
    `We received a request to reset your SiteFlow password.`,
    `Click the link below to choose a new password (expires in 1 hour):`,
    ``,
    resetUrl,
    ``,
    `If you did not request a password reset, you can safely ignore this email.`,
  ].join("\n");

  return { subject, html, text };
}

/**
 * Email verification email.
 * The verification link expires in 24 hours.
 */
export function renderEmailVerificationEmail(firstName: string, verifyUrl: string): RenderedEmail {
  const subject = "Verify your SiteFlow email address";

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
          <tr>
            <td style="background-color: #1a56db; padding: 24px 32px;">
              <span style="color: #ffffff; font-size: 20px; font-weight: bold; letter-spacing: 0.5px;">SiteFlow</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 12px 0; font-size: 20px; color: #111827;">Verify your email address</h1>
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #374151; line-height: 1.6;">
                Hi ${escapeHtml(firstName)},
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; color: #374151; line-height: 1.6;">
                Welcome to SiteFlow! Please verify your email address to activate your account.
                This link expires in <strong>24 hours</strong>.
              </p>
              <p style="margin: 0 0 24px 0;">
                <a href="${escapeHtml(verifyUrl)}"
                   style="display: inline-block; background-color: #1a56db; color: #ffffff; font-size: 15px;
                          font-weight: bold; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
                  Verify email
                </a>
              </p>
              <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.6;">
                If you didn't create a SiteFlow account, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
                If the button above doesn't work, copy and paste this link into your browser:<br />
                <a href="${escapeHtml(verifyUrl)}" style="color: #1a56db; word-break: break-all;">${escapeHtml(verifyUrl)}</a>
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
    `SiteFlow — Verify your email address`,
    `${"─".repeat(40)}`,
    `Hi ${firstName},`,
    ``,
    `Welcome to SiteFlow! Please verify your email address to activate your account.`,
    `Click the link below (expires in 24 hours):`,
    ``,
    verifyUrl,
    ``,
    `If you didn't create a SiteFlow account, you can safely ignore this email.`,
  ].join("\n");

  return { subject, html, text };
}

// ─── Notification Email Template ──────────────────────────────────────────────

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
