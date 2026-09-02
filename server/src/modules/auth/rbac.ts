import type { OrgRole, ProjectRole } from "@prisma/client";
import type { Permission } from "./permissions.js";
import { Permissions } from "./permissions.js";

const ROLE_PERMISSIONS: Record<OrgRole, Set<Permission>> = {
  ADMIN: new Set([
    Permissions.ORGANIZATION_READ,
    Permissions.ORGANIZATION_UPDATE,
    Permissions.ORGANIZATION_MANAGE_MEMBERS,
    Permissions.USER_READ,
    Permissions.USER_UPDATE,
    Permissions.USER_UPDATE_OWN,
    // Project permissions for org admins
    Permissions.PROJECT_CREATE,
    Permissions.PROJECT_READ,
    Permissions.PROJECT_UPDATE,
    Permissions.PROJECT_DELETE,
    Permissions.PROJECT_MANAGE_MEMBERS,
  ]),
  MEMBER: new Set([
    Permissions.ORGANIZATION_READ,
    Permissions.USER_READ,
    Permissions.USER_UPDATE_OWN,
    Permissions.PROJECT_READ,
  ]),
  BILLING: new Set([
    Permissions.ORGANIZATION_READ,
    Permissions.USER_READ,
    Permissions.USER_UPDATE_OWN,
    Permissions.PROJECT_READ,
  ]),
};

const PROJECT_ROLE_PERMISSIONS: Record<ProjectRole, Set<Permission>> = {
  PROJECT_MANAGER: new Set([
    Permissions.PROJECT_READ,
    Permissions.PROJECT_UPDATE,
    Permissions.PROJECT_MANAGE_MEMBERS,
    Permissions.TASK_CREATE,
    Permissions.TASK_UPDATE,
    Permissions.DOCUMENT_READ,
    Permissions.DOCUMENT_UPLOAD,
    Permissions.CHANGE_ORDER_APPROVE,
  ]),
  FINANCE: new Set([
    Permissions.PROJECT_READ,
    Permissions.TASK_UPDATE_OWN,
    Permissions.DOCUMENT_READ,
    Permissions.PAYMENT_APPROVE,
  ]),
  PROCUREMENT: new Set([
    Permissions.PROJECT_READ,
    Permissions.TASK_CREATE,
    Permissions.TASK_UPDATE_OWN,
    Permissions.DOCUMENT_READ,
    Permissions.DOCUMENT_UPLOAD,
  ]),
  SITE_SUPERVISOR: new Set([
    Permissions.PROJECT_READ,
    Permissions.TASK_CREATE,
    Permissions.TASK_UPDATE,
    Permissions.DOCUMENT_READ,
    Permissions.DOCUMENT_UPLOAD,
  ]),
  SUBCONTRACTOR: new Set([
    Permissions.PROJECT_READ,
    Permissions.TASK_UPDATE_OWN,
    Permissions.DOCUMENT_READ,
  ]),
  CLIENT: new Set([Permissions.PROJECT_READ, Permissions.DOCUMENT_READ]),
  VIEWER: new Set([Permissions.PROJECT_READ, Permissions.DOCUMENT_READ]),
};

export function hasPermission(role: OrgRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function hasProjectPermission(role: ProjectRole, permission: Permission): boolean {
  return PROJECT_ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}
