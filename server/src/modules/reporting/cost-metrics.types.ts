export interface CostBudgetSummary {
  original: number;
  approvedChanges: number;
  revised: number;
  committed: number;
  actual: number;
  forecast: number;
  variance: number;
  isOverBudget: boolean;
  /** actual cost / elapsed project days since plannedStartDate */
  burnRate: number;
}

export interface ChangeOrderSummary {
  total: number;
  approved: number;
  /** SUBMITTED or UNDER_REVIEW */
  pending: number;
  totalApprovedValue: number;
  totalPendingValue: number;
}

export interface BillingSummary {
  /** project.contractValue or 0 */
  contractValue: number;
  /** Sum of approved payment application currentPaymentDue */
  totalBilled: number;
  /** Sum of COMPLETED payments on AR invoices for this project */
  totalPaid: number;
  retainageWithheld: number;
  /** totalBilled / contractValue * 100 (0 when contractValue = 0) */
  billingPercent: number;
  /** totalBilled - totalPaid */
  outstandingReceivables: number;
}

export interface OverBudgetCostCode {
  costCode: string;
  name: string;
  revisedBudget: number;
  forecastCost: number;
  variance: number;
}

export interface CostMetrics {
  projectId: string;
  currency: string;
  computedAt: string;
  budget: CostBudgetSummary;
  changeOrders: ChangeOrderSummary;
  billing: BillingSummary;
  overBudgetCostCodes: OverBudgetCostCode[];
}
