import type { Job, Worker } from "bullmq";
import { createWorker } from "../../infrastructure/queue/index.js";
import { JOBS, QUEUES } from "../../infrastructure/queue/jobs.js";
import { invoiceRepository } from "./invoice.repository.js";
import { paymentApplicationRepository } from "./payment-application.repository.js";
import { PaymentApplicationStatus } from "@prisma/client";
import { auditRepository } from "../audit/audit.repository.js";
import { notificationService } from "../notifications/notification.service.js";
import { db } from "../../infrastructure/database/client.js";
import { logger } from "../../infrastructure/logger.js";

export interface CommercialJobData {
  orgId: string;
}

async function processOverdueInvoicesForOrg(orgId: string) {
  const overdueInvoices = await invoiceRepository.list(orgId, {
    isOverdue: true,
  });

  for (const inv of overdueInvoices) {
    // Keep existing audit log
    await auditRepository.create({
      orgId,
      action: "INVOICE_OVERDUE",
      entity: "Invoice",
      entityId: inv.id,
      newValue: {
        invoiceNumber: inv.invoiceNumber,
        dueDate: inv.dueDate,
        totalAmount: Number(inv.totalAmount),
        amountPaid: Number(inv.amountPaid),
      },
    });

    const outstanding = Number(inv.totalAmount) - Number(inv.amountPaid);
    const dueDateStr = inv.dueDate instanceof Date
      ? inv.dueDate.toISOString().split("T")[0]
      : String(inv.dueDate);

    // Notify the invoice creator
    await notificationService.send({
      orgId,
      userId: inv.createdById,
      type: "INVOICE_OVERDUE",
      title: "Invoice Overdue",
      body: `Invoice ${inv.invoiceNumber} was due on ${dueDateStr}. Outstanding: $${outstanding.toFixed(2)}.`,
      entityType: "Invoice",
      entityId: inv.id,
    });

    // Also notify the approver if different from creator
    if (inv.approvedById && inv.approvedById !== inv.createdById) {
      await notificationService.send({
        orgId,
        userId: inv.approvedById,
        type: "INVOICE_OVERDUE",
        title: "Invoice Overdue",
        body: `Invoice ${inv.invoiceNumber} was due on ${dueDateStr}. Outstanding: $${outstanding.toFixed(2)}.`,
        entityType: "Invoice",
        entityId: inv.id,
      });
    }
  }

  return { scanned: overdueInvoices.length };
}

async function processPendingPaymentApplicationsForOrg(orgId: string) {
  const pendingApps = await paymentApplicationRepository.list(orgId, {
    status: PaymentApplicationStatus.SUBMITTED,
  });

  // Fetch ADMIN and BILLING org members to notify reviewers
  const reviewers = await db.organizationMember.findMany({
    where: { orgId, role: { in: ["ADMIN", "BILLING"] } },
    select: { userId: true },
  });

  for (const app of pendingApps) {
    // Keep existing audit log
    await auditRepository.create({
      orgId,
      action: "PAYMENT_APPLICATION_REMINDER",
      entity: "PaymentApplication",
      entityId: app.id,
      newValue: {
        applicationNumber: app.applicationNumber,
        currentPaymentDue: Number(app.currentPaymentDue),
      },
    });

    // Notify the applicant (submitter reminder)
    await notificationService.send({
      orgId,
      userId: app.submittedById,
      type: "PAYMENT_APP_PENDING",
      title: "Payment Application Awaiting Review",
      body: `Payment Application #${app.applicationNumber} (${app.currentPaymentDue ? `$${Number(app.currentPaymentDue).toFixed(2)}` : "amount pending"}) is still awaiting review.`,
      entityType: "PaymentApplication",
      entityId: app.id,
    });

    // Notify org reviewers (ADMIN/BILLING)
    for (const reviewer of reviewers) {
      if (reviewer.userId !== app.submittedById) {
        await notificationService.send({
          orgId,
          userId: reviewer.userId,
          type: "PAYMENT_APP_PENDING",
          title: "Payment Application Pending Review",
          body: `Payment Application #${app.applicationNumber} has been waiting for review. Please action it.`,
          entityType: "PaymentApplication",
          entityId: app.id,
        });
      }
    }
  }

  return { pending: pendingApps.length };
}

export async function processOverdueInvoices(job: Job<CommercialJobData>) {
  const { orgId } = job.data;

  if (orgId === "all") {
    const orgs = await db.organization.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });

    let total = 0;
    for (const org of orgs) {
      try {
        const result = await processOverdueInvoicesForOrg(org.id);
        total += result.scanned;
      } catch (err) {
        logger.error({ err, orgId: org.id }, "Overdue invoice check failed for org");
      }
    }
    return { scanned: total };
  }

  return processOverdueInvoicesForOrg(orgId);
}

export async function processPendingPaymentApplications(job: Job<CommercialJobData>) {
  const { orgId } = job.data;

  if (orgId === "all") {
    const orgs = await db.organization.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });

    let total = 0;
    for (const org of orgs) {
      try {
        const result = await processPendingPaymentApplicationsForOrg(org.id);
        total += result.pending;
      } catch (err) {
        logger.error({ err, orgId: org.id }, "Pending payment apps check failed for org");
      }
    }
    return { pending: total };
  }

  return processPendingPaymentApplicationsForOrg(orgId);
}

export function startCommercialWorker(): Worker<CommercialJobData> {
  return createWorker<CommercialJobData>(
    QUEUES.COMMERCIAL,
    async (job) => {
      if (job.name === JOBS.CHECK_OVERDUE_INVOICES) {
        return processOverdueInvoices(job);
      }
      if (job.name === JOBS.CHECK_PENDING_PAYMENT_APPLICATIONS) {
        return processPendingPaymentApplications(job);
      }
    },
  );
}
