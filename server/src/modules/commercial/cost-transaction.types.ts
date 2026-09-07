import type { CostTransaction, CostTransactionStatus, CostTransactionType } from "@prisma/client";

export const COST_TRANSACTION_AUDIT_ACTIONS = {
  COST_TRANSACTION_RECORDED: "COST_TRANSACTION_RECORDED",
  COST_TRANSACTION_VOIDED: "COST_TRANSACTION_VOIDED",
} as const;

export const COST_TRANSACTION_DOMAIN_EVENTS = {
  COST_TRANSACTION_RECORDED: "CostTransactionRecorded",
} as const;

export interface RecordCostTransactionInput {
  projectId: string;
  costCodeId: string;
  transactionType: CostTransactionType;
  amount: number;
  currency?: string;
  transactionDate: Date;
  description: string;
  referenceNumber?: string;
  vendorId?: string;
  subcontractorId?: string;
  purchaseOrderId?: string;
  taskId?: string;
  invoiceId?: string;
}

export interface VoidCostTransactionInput {
  id: string;
  voidReason: string;
}

export interface CostTransactionFilters {
  projectId?: string;
  costCodeId?: string;
  transactionType?: CostTransactionType;
  status?: CostTransactionStatus;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface CostTransactionDetail extends CostTransaction {
  costCode?: {
    id: string;
    code: string;
    name: string;
  };
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
  task?: {
    id: string;
    name: string;
  } | null;
}

export interface ActualCostSummary {
  projectId: string;
  totalActualCost: number;
  byType: Record<CostTransactionType, number>;
  byCostCode: Array<{
    costCodeId: string;
    costCode: string;
    name: string;
    actualAmount: number;
  }>;
}
