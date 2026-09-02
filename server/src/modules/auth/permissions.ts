export const Permissions = {
  // Organization
  ORGANIZATION_READ: "organization:read",
  ORGANIZATION_UPDATE: "organization:update",
  ORGANIZATION_MANAGE_MEMBERS: "organization:manage_members",

  // User
  USER_READ: "user:read",
  USER_UPDATE: "user:update",
  USER_UPDATE_OWN: "user:update:own",

  // Project (org-level)
  PROJECT_CREATE: "project:create",
  PROJECT_READ: "project:read",
  PROJECT_UPDATE: "project:update",
  PROJECT_DELETE: "project:delete",
  PROJECT_MANAGE_MEMBERS: "project:manage_members",

  // Task (project-level)
  TASK_CREATE: "task:create",
  TASK_UPDATE: "task:update",
  TASK_UPDATE_OWN: "task:update:own",

  // Document (project-level)
  DOCUMENT_READ: "document:read",
  DOCUMENT_UPLOAD: "document:upload",

  // Finance (project-level)
  PAYMENT_APPROVE: "payment:approve",
  CHANGE_ORDER_APPROVE: "change_order:approve",

  // Estimate (org-level)
  ESTIMATE_CREATE: "estimate:create",
  ESTIMATE_READ: "estimate:read",
  ESTIMATE_UPDATE: "estimate:update",
  ESTIMATE_DELETE: "estimate:delete",
  ESTIMATE_APPROVE: "estimate:approve",
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];
