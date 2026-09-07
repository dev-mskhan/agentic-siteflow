import type { Job, Worker } from "bullmq";
import { createWorker } from "../../infrastructure/queue/index.js";
import { JOBS, QUEUES } from "../../infrastructure/queue/jobs.js";
import { invoiceRepository } from "./invoice.repository.js";
import { paymentApplicationRepository } from "./payment-application.repository.js";
import { PaymentApplicationStatus } from "@prisma/client";
import { auditRepository } from "../audit/audit.repository.js";

export interface CommercialJobData {
  orgId: string;
}

export async function processOverdueInvoices(job: Job<CommercialJobData>) {
  const { orgId } = job.data;
  const overdueInvoices = await invoiceRepository.list(orgId, {
    isOverdue: true,
  });

  for (const inv of overdueInvoices) {
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
  }

  return { scanned: overdueInvoices.length };
}

export async function processPendingPaymentApplications(job: Job<CommercialJobData>) {
  const { orgId } = job.data;
  const pendingApps = await paymentApplicationRepository.list(orgId, {
    status: PaymentApplicationStatus.SUBMITTED,
  });

  for (const app of pendingApps) {
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
  }

  return { pending: pendingApps.length };
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
