import type {
  PaymentApplication,
  PaymentApplicationLineItem,
  PaymentApplicationStatus,
  PaymentApplicationType,
  Prisma,
} from "@prisma/client";

export const PAYMENT_APPLICATION_AUDIT_ACTIONS = {
  PAYMENT_APPLICATION_CREATED: "PAYMENT_APPLICATION_CREATED",
  PAYMENT_APPLICATION_SUBMITTED: "PAYMENT_APPLICATION_SUBMITTED",
  PAYMENT_APPLICATION_APPROVED: "PAYMENT_APPLICATION_APPROVED",
  PAYMENT_APPLICATION_REJECTED: "PAYMENT_APPLICATION_REJECTED",
} as const;

export const PAYMENT_APPLICATION_DOMAIN_EVENTS = {
  PAYMENT_APPLICATION_SUBMITTED: "PaymentApplicationSubmitted",
  PAYMENT_APPLICATION_APPROVED: "PaymentApplicationApproved",
  PAYMENT_APPLICATION_REJECTED: "PaymentApplicationRejected",
} as const;

export interface PaymentApplicationLineItemInput {
  sovItemId: string;
  workCompletedThisPeriod: number;
  materialsPresentlyStored?: number;
}

export interface CreatePaymentApplicationInput {
  projectId: string;
  sovId: string;
  periodStart: Date;
  periodEnd: Date;
  type?: PaymentApplicationType;
  subcontractorId?: string;
  contractId?: string;
  retainagePercent?: number; // e.g. 0.10 for 10%
  lineItems: PaymentApplicationLineItemInput[];
}

export interface ApprovePaymentApplicationInput {
  id: string;
}

export interface RejectPaymentApplicationInput {
  id: string;
  rejectionReason: string;
}

export interface PaymentApplicationFilters {
  projectId?: string;
  sovId?: string;
  status?: PaymentApplicationStatus;
  type?: PaymentApplicationType;
  subcontractorId?: string;
  limit?: number;
  offset?: number;
}

export interface PaymentApplicationDetail extends PaymentApplication {
  lineItems: Array<
    PaymentApplicationLineItem & {
      sovItem?: {
        id: string;
        itemNumber: string;
        description: string;
        scheduledValue: Prisma.Decimal;
      };
    }
  >;
  sov?: {
    id: string;
    title: string;
    totalScheduledValue: Prisma.Decimal;
  };
  submittedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  approvedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}
