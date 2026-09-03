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

  // Subcontractor
  SUBCONTRACTOR_CREATE: "subcontractor:create",
  SUBCONTRACTOR_READ: "subcontractor:read",
  SUBCONTRACTOR_UPDATE: "subcontractor:update",
  SUBCONTRACTOR_DELETE: "subcontractor:delete",

  // Vendor
  VENDOR_CREATE: "vendor:create",
  VENDOR_READ: "vendor:read",
  VENDOR_UPDATE: "vendor:update",
  VENDOR_DELETE: "vendor:delete",

  // Material Catalog
  MATERIAL_CREATE: "material:create",
  MATERIAL_READ: "material:read",
  MATERIAL_UPDATE: "material:update",

  // Material Request
  MATERIAL_REQUEST_CREATE: "material_request:create",
  MATERIAL_REQUEST_READ: "material_request:read",
  MATERIAL_REQUEST_UPDATE: "material_request:update",
  MATERIAL_REQUEST_APPROVE: "material_request:approve",

  // Purchase Order
  PURCHASE_ORDER_CREATE: "purchase_order:create",
  PURCHASE_ORDER_READ: "purchase_order:read",
  PURCHASE_ORDER_UPDATE: "purchase_order:update",
  PURCHASE_ORDER_APPROVE: "purchase_order:approve",

  // Deliveries & Inventory
  DELIVERY_CREATE: "delivery:create",
  DELIVERY_READ: "delivery:read",
  DELIVERY_UPDATE: "delivery:update",
  INVENTORY_READ: "inventory:read",
  INVENTORY_TRANSACT: "inventory:transact",
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];
