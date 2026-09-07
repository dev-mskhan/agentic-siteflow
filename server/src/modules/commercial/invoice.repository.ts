import { InvoiceStatus, Prisma, type Invoice } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type { CreateInvoiceInput, InvoiceDetail, InvoiceFilters } from "./invoice.types.js";

export class InvoiceRepository {
  async create(
    orgId: string,
    createdById: string,
    input: CreateInvoiceInput,
  ): Promise<Invoice> {
    const subtotal = new Prisma.Decimal(input.subtotal);
    const tax = new Prisma.Decimal(input.taxAmount ?? 0);
    const retainage = new Prisma.Decimal(input.retainageWithheld ?? 0);
    const totalAmount = subtotal.add(tax).sub(retainage);

    return db.invoice.create({
      data: {
        orgId,
        projectId: input.projectId,
        invoiceNumber: input.invoiceNumber,
        type: input.type,
        status: InvoiceStatus.DRAFT,
        vendorId: input.vendorId,
        subcontractorId: input.subcontractorId,
        purchaseOrderId: input.purchaseOrderId,
        paymentApplicationId: input.paymentApplicationId,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        subtotal,
        taxAmount: tax,
        retainageWithheld: retainage,
        totalAmount,
        amountPaid: new Prisma.Decimal(0),
        notes: input.notes,
        createdById,
      },
    });
  }

  async findById(orgId: string, id: string): Promise<InvoiceDetail | null> {
    return db.invoice.findFirst({
      where: { id, orgId },
      include: {
        payments: true,
        vendor: {
          select: { id: true, name: true },
        },
        subcontractor: {
          select: { id: true, companyName: true },
        },
        purchaseOrder: {
          select: { id: true, poNumber: true },
        },
        paymentApplication: {
          select: { id: true, applicationNumber: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  async findByNumber(orgId: string, invoiceNumber: string): Promise<Invoice | null> {
    return db.invoice.findUnique({
      where: {
        orgId_invoiceNumber: { orgId, invoiceNumber },
      },
    });
  }

  async list(orgId: string, filters: InvoiceFilters = {}): Promise<InvoiceDetail[]> {
    const {
      projectId,
      type,
      status,
      vendorId,
      subcontractorId,
      isOverdue,
      limit = 50,
      offset = 0,
    } = filters;

    const now = new Date();

    return db.invoice.findMany({
      where: {
        orgId,
        ...(projectId && { projectId }),
        ...(type && { type }),
        ...(status && { status }),
        ...(vendorId && { vendorId }),
        ...(subcontractorId && { subcontractorId }),
        ...(isOverdue && {
          dueDate: { lt: now },
          status: { in: [InvoiceStatus.DRAFT, InvoiceStatus.SUBMITTED, InvoiceStatus.APPROVED, InvoiceStatus.PARTIALLY_PAID] },
        }),
      },
      include: {
        payments: true,
        vendor: {
          select: { id: true, name: true },
        },
        subcontractor: {
          select: { id: true, companyName: true },
        },
        purchaseOrder: {
          select: { id: true, poNumber: true },
        },
        paymentApplication: {
          select: { id: true, applicationNumber: true },
        },
      },
      orderBy: { dueDate: "asc" },
      take: limit,
      skip: offset,
    });
  }

  async updateStatus(
    id: string,
    data: Prisma.InvoiceUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Invoice> {
    const client = tx ?? db;
    return client.invoice.update({
      where: { id },
      data,
    });
  }
}

export const invoiceRepository = new InvoiceRepository();
