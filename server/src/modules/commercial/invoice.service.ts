import { CostTransactionType, InvoiceStatus, Prisma, type Invoice, type Payment } from "@prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "../../common/AppError.js";
import { db } from "../../infrastructure/database/client.js";
import { cacheDel, cacheKey } from "../../infrastructure/redis/cache.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import { projectRepository as defaultProjectRepository, type ProjectRepository } from "../projects/project.repository.js";
import { costTransactionRepository as defaultCostRepo, type CostTransactionRepository } from "./cost-transaction.repository.js";
import { invoiceRepository as defaultInvoiceRepo, type InvoiceRepository } from "./invoice.repository.js";
import { paymentRepository as defaultPaymentRepo, type PaymentRepository } from "./payment.repository.js";
import {
  INVOICE_AUDIT_ACTIONS,
  type ApproveInvoiceInput,
  type CreateInvoiceInput,
  type InvoiceDetail,
  type InvoiceFilters,
  type RecordPaymentInput,
} from "./invoice.types.js";
import { assertNotSelfApprover } from "./segregation.guard.js";

export class InvoiceService {
  constructor(
    private readonly invoiceRepo: InvoiceRepository = defaultInvoiceRepo,
    private readonly paymentRepo: PaymentRepository = defaultPaymentRepo,
    private readonly costRepo: CostTransactionRepository = defaultCostRepo,
    private readonly projectRepo: ProjectRepository = defaultProjectRepository,
    private readonly audit: AuditService = defaultAuditService,
  ) {}

  async createInvoice(
    orgId: string,
    userId: string,
    input: CreateInvoiceInput,
  ): Promise<Invoice> {
    const project = await this.projectRepo.findById(orgId, input.projectId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }

    if (input.subtotal <= 0) {
      throw new ValidationError("Invoice subtotal must be greater than 0");
    }

    const existing = await this.invoiceRepo.findByNumber(orgId, input.invoiceNumber);
    if (existing) {
      throw new ConflictError(`Invoice number '${input.invoiceNumber}' already exists`);
    }

    const invoice = await this.invoiceRepo.create(orgId, userId, input);

    await this.audit.log({
      orgId,
      userId,
      action: INVOICE_AUDIT_ACTIONS.INVOICE_CREATED,
      entity: "Invoice",
      entityId: invoice.id,
      newValue: {
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: Number(invoice.totalAmount),
        type: invoice.type,
      },
    });

    return invoice;
  }

  async getInvoice(orgId: string, id: string): Promise<InvoiceDetail> {
    const inv = await this.invoiceRepo.findById(orgId, id);
    if (!inv) {
      throw new NotFoundError("Invoice not found");
    }
    return inv;
  }

  async listInvoices(orgId: string, filters: InvoiceFilters = {}): Promise<InvoiceDetail[]> {
    return this.invoiceRepo.list(orgId, filters);
  }

  async approveInvoice(
    orgId: string,
    userId: string,
    input: ApproveInvoiceInput,
  ): Promise<Invoice> {
    const inv = await this.invoiceRepo.findById(orgId, input.id);
    if (!inv) {
      throw new NotFoundError("Invoice not found");
    }

    if (inv.status !== InvoiceStatus.DRAFT && inv.status !== InvoiceStatus.SUBMITTED) {
      throw new ValidationError(`Cannot approve invoice in '${inv.status}' status`);
    }

    // Segregation of duties: invoice creator cannot approve
    assertNotSelfApprover(inv.createdById, userId, "invoice");

    const approved = await this.invoiceRepo.updateStatus(input.id, {
      status: InvoiceStatus.APPROVED,
      approvedBy: { connect: { id: userId } },
      approvedAt: new Date(),
    });

    await this.audit.log({
      orgId,
      userId,
      action: INVOICE_AUDIT_ACTIONS.INVOICE_APPROVED,
      entity: "Invoice",
      entityId: input.id,
      oldValue: { status: inv.status },
      newValue: { status: approved.status, approvedById: userId },
    });

    await cacheDel(
      cacheKey.financialOverview(inv.projectId),
      cacheKey.orgFinancialOverview(orgId),
    );

    return approved;
  }

  async recordPayment(
    orgId: string,
    userId: string,
    input: RecordPaymentInput,
  ): Promise<{ payment: Payment; invoice: Invoice }> {
    const invoice = await this.invoiceRepo.findById(orgId, input.invoiceId);
    if (!invoice) {
      throw new NotFoundError("Invoice not found");
    }

    if (invoice.status === InvoiceStatus.VOID || invoice.status === InvoiceStatus.PAID) {
      throw new ValidationError(`Cannot record payment for invoice in '${invoice.status}' status`);
    }

    if (input.amount <= 0) {
      throw new ValidationError("Payment amount must be greater than 0");
    }

    // Segregation of duties: invoice creator cannot record payment
    assertNotSelfApprover(invoice.createdById, userId, "invoice payment");

    // Execute payment and invoice status update transactionally
    const result = await db.$transaction(async (tx) => {
      const payment = await this.paymentRepo.create(orgId, userId, input, tx);

      const newAmountPaid = invoice.amountPaid.add(new Prisma.Decimal(input.amount));
      const isFullyPaid = newAmountPaid.gte(invoice.totalAmount);
      const newStatus = isFullyPaid ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: newAmountPaid,
          status: newStatus,
        },
      });

      // If costCodeId is supplied (or invoice has a project), record actual cost transaction
      if (input.costCodeId) {
        await this.costRepo.create(
          orgId,
          userId,
          {
            projectId: invoice.projectId,
            costCodeId: input.costCodeId,
            transactionType: invoice.subcontractorId
              ? CostTransactionType.SUBCONTRACTOR
              : CostTransactionType.MATERIAL,
            amount: input.amount,
            transactionDate: input.paymentDate,
            description: `Payment for invoice ${invoice.invoiceNumber}`,
            referenceNumber: input.referenceNumber,
            vendorId: invoice.vendorId ?? undefined,
            subcontractorId: invoice.subcontractorId ?? undefined,
            purchaseOrderId: invoice.purchaseOrderId ?? undefined,
            invoiceId: invoice.id,
          },
          tx,
        );
      }

      return { payment, invoice: updatedInvoice };
    });

    await this.audit.log({
      orgId,
      userId,
      action: INVOICE_AUDIT_ACTIONS.PAYMENT_RECORDED,
      entity: "Payment",
      entityId: result.payment.id,
      newValue: {
        paymentNumber: result.payment.paymentNumber,
        amount: Number(result.payment.amount),
        invoiceId: invoice.id,
        invoiceStatus: result.invoice.status,
      },
    });

    await cacheDel(
      cacheKey.financialOverview(invoice.projectId),
      cacheKey.orgFinancialOverview(orgId),
    );

    return result;
  }

  async listPayments(orgId: string, limit = 50, offset = 0): Promise<Payment[]> {
    return this.paymentRepo.listByOrg(orgId, limit, offset);
  }
}

export const invoiceService = new InvoiceService();
