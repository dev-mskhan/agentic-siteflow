export interface CostCodeFinancialSummary {
  costCodeId: string;
  costCode: string;
  name: string;
  category: string | null;
  originalBudget: number;
  approvedChanges: number;
  revisedBudget: number;
  committedCost: number;
  actualCost: number;
  forecastCost: number; // actualCost + max(0, committedCost - actualCost)
  variance: number; // revisedBudget - forecastCost
  percentSpent: number; // (actualCost / revisedBudget) * 100
  percentCommitted: number; // (committedCost / revisedBudget) * 100
  isOverBudget: boolean; // forecastCost > revisedBudget
}

export interface ProjectCommercialOverview {
  projectId: string;
  projectName: string;
  currency: string;
  totalOriginalBudget: number;
  totalApprovedChanges: number;
  totalRevisedBudget: number;
  totalCommittedCost: number;
  totalActualCost: number;
  totalForecastCost: number;
  totalVariance: number;
  burnRate: number; // actualCost / duration or elapsed progress
  isOverBudget: boolean;
  costCodeBreakdown: CostCodeFinancialSummary[];
}

export interface OrgCommercialOverview {
  totalBudget: number;
  totalCommitted: number;
  totalActual: number;
  totalVariance: number;
  projectsCount: number;
  overBudgetProjectsCount: number;
  projectSummaries: Array<{
    projectId: string;
    projectName: string;
    revisedBudget: number;
    committedCost: number;
    actualCost: number;
    forecastCost: number;
    variance: number;
    isOverBudget: boolean;
  }>;
}
