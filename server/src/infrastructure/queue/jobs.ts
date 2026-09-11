export const QUEUES = {
  EMAIL: "email",
  NOTIFICATIONS: "notifications",
  WEBHOOKS: "webhooks",
  REPORTS: "reports",
  FILE_PROCESSING: "file-processing",
  IMPORTS: "imports",
  EXPORTS: "exports",
  ANALYTICS: "analytics",
  CLEANUP: "cleanup",
  SCHEDULED_JOBS: "scheduled-jobs",
  DOCUMENTS: "documents",
  COMPLIANCE: "compliance",
  COMMUNICATIONS: "project-communications",
  COMMERCIAL: "commercial",
  TASKS: "tasks",
} as const;

export const ALL_QUEUES = Object.values(QUEUES);

export const JOBS = {
  DOCUMENT_PROCESS: "DOCUMENT_PROCESS",
  CHECK_COMPLIANCE_EXPIRATIONS: "CHECK_COMPLIANCE_EXPIRATIONS",
  CHECK_OVERDUE_RFIS_AND_SUBMITTALS: "CHECK_OVERDUE_RFIS_AND_SUBMITTALS",
  CHECK_OVERDUE_INVOICES: "CHECK_OVERDUE_INVOICES",
  CHECK_PENDING_PAYMENT_APPLICATIONS: "CHECK_PENDING_PAYMENT_APPLICATIONS",
  CHECK_OVERDUE_TASKS: "CHECK_OVERDUE_TASKS",
} as const;
