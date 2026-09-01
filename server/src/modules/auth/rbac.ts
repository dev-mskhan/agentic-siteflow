import type { OrgRole } from "@prisma/client";
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
  ]),
  MEMBER: new Set([
    Permissions.ORGANIZATION_READ,
    Permissions.USER_READ,
    Permissions.USER_UPDATE_OWN,
  ]),
  BILLING: new Set([
    Permissions.ORGANIZATION_READ,
    Permissions.USER_READ,
    Permissions.USER_UPDATE_OWN,
  ]),
};

export function hasPermission(role: OrgRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}
