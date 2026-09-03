export interface CostCodeCommittedBreakdown {
  costCodeId: string;
  code: string;
  name: string;
  poCommitted: number;
  subcontractorCommitted: number;
  totalCommitted: number;
}

export interface ProjectCommittedCostSummary {
  projectId: string;
  currency: string;
  poCommittedTotal: number;
  subcontractorCommittedTotal: number;
  totalCommittedCost: number;
  budget: number | null;
  uncommittedBudget: number | null;
  isOverCommitted: boolean;
  costCodeBreakdown: CostCodeCommittedBreakdown[];
}

export interface ProjectCommittedCostItem {
  projectId: string;
  projectName: string;
  currency: string;
  poCommittedTotal: number;
  subcontractorCommittedTotal: number;
  totalCommittedCost: number;
  budget: number | null;
  uncommittedBudget: number | null;
  isOverCommitted: boolean;
}

export interface OrgCommittedCostOverview {
  orgId: string;
  totalPoCommitted: number;
  totalSubcontractorCommitted: number;
  totalCommittedCost: number;
  projects: ProjectCommittedCostItem[];
}
