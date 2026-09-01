export const Permissions = {
  ORGANIZATION_READ: "organization:read",
  ORGANIZATION_UPDATE: "organization:update",
  ORGANIZATION_MANAGE_MEMBERS: "organization:manage_members",
  USER_READ: "user:read",
  USER_UPDATE: "user:update",
  USER_UPDATE_OWN: "user:update:own",
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];
