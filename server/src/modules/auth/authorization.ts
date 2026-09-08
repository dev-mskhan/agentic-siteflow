import type { OrgRole, ProjectRole } from "@prisma/client";
import { hasPermission, hasProjectPermission } from "./rbac.js";
import type { Permission } from "./permissions.js";

/**
 * Checks whether a user may mutate a resource, respecting ownership-scoped
 * permissions (e.g. task:update:own vs task:update).
 *
 * Logic:
 *  - If the user has the broad permission → allow
 *  - Else if the user has the own permission AND is the resource owner → allow
 *  - Otherwise → deny
 */
export function checkOwnership(
  userId: string,
  resourceOwnerId: string | null | undefined,
  broadPermission: Permission,
  ownPermission: Permission,
  userRole: OrgRole,
): boolean {
  if (hasPermission(userRole, broadPermission)) return true;
  if (resourceOwnerId === userId && hasPermission(userRole, ownPermission)) return true;
  return false;
}

/**
 * Project-level variant — checks ProjectRole permissions.
 */
export function checkProjectOwnership(
  userId: string,
  resourceOwnerId: string | null | undefined,
  broadPermission: Permission,
  ownPermission: Permission,
  projectRole: ProjectRole,
): boolean {
  if (hasProjectPermission(projectRole, broadPermission)) return true;
  if (resourceOwnerId === userId && hasProjectPermission(projectRole, ownPermission)) return true;
  return false;
}
