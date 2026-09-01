import type { OrgRole, OrgStatus } from "@prisma/client";

// ─── Input types ──────────────────────────────────────────────────────────────

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  plan?: string;
}

export interface UpdateOrganizationInput {
  name?: string;
  plan?: string;
  status?: OrgStatus;
  settings?: Record<string, unknown>;
}

// ─── Output types ─────────────────────────────────────────────────────────────

export interface OrganizationOutput {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: OrgStatus;
  settings: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationMemberOutput {
  orgId: string;
  userId: string;
  role: OrgRole;
  joinedAt: Date;
  invitedBy: string | null;
}

// Re-export enums from Prisma for use within the module
export { OrgRole, OrgStatus };
