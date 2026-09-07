import type {
  Invoice,
  InvoiceStatus,
  InvoiceType,
  Payment,
  PaymentMethod,
} from "@prisma/client";

export const INVOICE_AUDIT_ACTIONS = {
  INVOICE_CREATED: "INVOICE_CREATED",
  INVOICE_APPROVED: "INVOICE_APPROVED",
  INVOICE_VOIDED: "INVOICE_VOIDED",
  PAYMENT_RECORDED: "PAYMENT_RECORDED",
  PAYMENT_VOIDED: "PAYMENT_VOIDED",
} as const;

export const INVOICE_DOMAIN_EVENTS = {
  INVOICE_CREATED: "InvoiceCreated",
  INVOICE_APPROVED: "InvoiceApproved",
  INVOICE_OVERDUE: "InvoiceOverdue",
  PAYMENT_RECORDED: "PaymentRecorded",
  PAYMENT_OVERDUE: "PaymentOverdue",
} as const;

export interface CreateInvoiceInput {
  projectId: string;
  invoiceNumber: string;
  type: InvoiceType;
  vendorId?: string;
  subcontractorId?: string;
  purchaseOrderId?: string;
  paymentApplicationId?: string;
  issueDate: Date;
  dueDate: Date;
  subtotal: number;
  taxAmount?: number;
  retainageWithheld?: number;
  notes?: string;
}

export interface ApproveInvoiceInput {
  id: string;
}

export interface RecordPaymentInput {
  invoiceId: string;
  amount: number;
  paymentDate: Date;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
  costCodeId?: string; // Optional costCode to auto-post actual CostTransaction
}

export interface InvoiceFilters {
  projectId?: string;
  type?: InvoiceType;
  status?: InvoiceStatus;
  vendorId?: string;
  subcontractorId?: string;
  isOverdue?: boolean;
  limit?: number;
  offset?: number;
}

export interface InvoiceDetail extends Invoice {
  payments: Payment[];
  vendor?: {
    id: string;
    name: string;
  } | null;
  subcontractor?: {
    id: string;
    companyName: string;
  } | null;
  purchaseOrder?: {
    id: string;
    poNumber: string;
  } | null;
  paymentApplication?: {
    id: string;
    applicationNumber: number;
  } | null;
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}
