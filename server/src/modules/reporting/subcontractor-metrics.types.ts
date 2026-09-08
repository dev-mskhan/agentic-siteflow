export interface SubcontractorContractSummary {
  total: number;
  active: number;
  totalContractValue: number;
  totalPaid: number;
  retainageWithheld: number;
}

export interface SubcontractorTaskPerformance {
  totalAssignedTasks: number;
  /** DONE AND actualEndDate <= plannedEndDate */
  completedOnTime: number;
  /** DONE AND actualEndDate > plannedEndDate */
  completedLate: number;
  /** Not DONE AND plannedEndDate < today */
  currentlyOverdue: number;
}

export interface ExpiringCredential {
  id: string;
  companyName: string;
  expiryDate: string;
}

export interface SubcontractorComplianceStatus {
  compliantCount: number;
  nonCompliantCount: number;
  /** Insurance expiring within 30 days */
  expiringInsurance: ExpiringCredential[];
  /** License expiring within 30 days */
  expiringLicense: ExpiringCredential[];
}

export interface SubcontractorRollup {
  subcontractorId: string;
  companyName: string;
  trade: string;
  contractValue: number;
  taskCount: number;
  completedTasks: number;
  overdueTasks: number;
  rating: number | null;
}

export interface SubcontractorMetrics {
  projectId: string;
  computedAt: string;
  contracts: SubcontractorContractSummary;
  taskPerformance: SubcontractorTaskPerformance;
  complianceStatus: SubcontractorComplianceStatus;
  bySubcontractor: SubcontractorRollup[];
}
