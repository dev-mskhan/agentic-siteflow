import type { BudgetItem } from "@prisma/client";

export const BUDGET_AUDIT_ACTIONS = {
  BUDGET_INITIALIZED: "BUDGET_INITIALIZED",
  BUDGET_ITEM_UPDATED: "BUDGET_ITEM_UPDATED",
  BUDGET_RECONCILED: "BUDGET_RECONCILED",
} as const;

export const BUDGET_DOMAIN_EVENTS = {
  BUDGET_UPDATED: "BudgetUpdated",
} as const;

export interface BudgetItemInput {
  costCodeId: string;
  originalAmount: number;
  notes?: string;
}

export interface SetProjectBudgetInput {
  projectId: string;
  items: BudgetItemInput[];
}

export interface UpdateBudgetItemInput {
  originalAmount?: number;
  notes?: string;
}

export interface BudgetItemDetail extends BudgetItem {
  costCode?: {
    id: string;
    code: string;
    name: string;
    category: string | null;
  };
}

export interface ProjectBudgetSummary {
  projectId: string;
  projectBudget: number | null;
  totalOriginalAmount: number;
  totalApprovedChanges: number;
  totalRevisedAmount: number;
  itemsCount: number;
  varianceToProjectBudget: number; // project.budget - totalRevisedAmount
  isAllocatedUnderBudget: boolean;
  items: BudgetItemDetail[];
}
