import { randomBytes } from "crypto";
import { ConflictError, NotFoundError, ValidationError } from "../../common/index.js";
import type { OrganizationRepository } from "./organization.repository.js";
import type { InvitationRepository } from "./invitation.repository.js";
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  OrganizationOutput,
  OrganizationMemberOutput,
} from "./organization.types.js";
import type { OrgRole } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";

// Slug must be lowercase alphanumeric with hyphens only
const SLUG_REGEX = /^[a-z0-9-]+$/;

export interface InviteUserInput {
  email: string;
  role?: OrgRole;
  invitedById: string;
}

export interface MemberWithUser {
  orgId: string;
  userId: string;
  role: OrgRole;
  joinedAt: Date;
  invitedBy: string | null;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

/**
 * Business-logic layer for Organizations.
 * Receives a repository through the constructor — easy to mock in tests.
 */
export class OrganizationService {
  constructor(
    private readonly repo: OrganizationRepository,
    private readonly invitationRepo?: InvitationRepository,
  ) {}

  async createOrganization(input: CreateOrganizationInput): Promise<OrganizationOutput> {
    // Validate slug format
    if (!SLUG_REGEX.test(input.slug)) {
      throw new ValidationError(
        "Slug must contain only lowercase letters, numbers, and hyphens",
      );
    }

    // Check slug uniqueness
    const existing = await this.repo.findBySlug(input.slug);
    if (existing) {
      throw new ConflictError(`Organization slug "${input.slug}" is already taken`);
    }

    return this.repo.create(input);
  }

  async getOrganization(id: string): Promise<OrganizationOutput> {
    const org = await this.repo.findById(id);
    if (!org) {
      throw new NotFoundError(`Organization not found`);
    }
    return org;
  }

  async updateOrganization(
    id: string,
    input: UpdateOrganizationInput,
  ): Promise<OrganizationOutput> {
    // Ensure the org exists before updating
    const org = await this.repo.findById(id);
    if (!org) {
      throw new NotFoundError(`Organization not found`);
    }

    return this.repo.update(id, input);
  }

  async inviteUser(
    orgId: string,
    input: InviteUserInput,
  ): Promise<{ token: string; email: string }> {
    if (!this.invitationRepo) throw new Error("InvitationRepository not injected");

    const email = input.email.toLowerCase().trim();

    // Check not already a member
    const existingMember = await db.organizationMember.findFirst({
      where: { orgId, user: { email } },
    });
    if (existingMember) {
      throw new ConflictError("User is already a member of this organization");
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.invitationRepo.create({
      orgId,
      email,
      role: input.role ?? "MEMBER",
      token,
      expiresAt,
      invitedById: input.invitedById,
    });

    return { token, email };
  }

  async acceptInvitation(token: string, userId: string): Promise<OrganizationMemberOutput> {
    if (!this.invitationRepo) throw new Error("InvitationRepository not injected");

    const invitation = await this.invitationRepo.findByToken(token);

    if (!invitation) {
      throw new NotFoundError("Invitation not found");
    }

    if (invitation.status !== "PENDING" || invitation.expiresAt < new Date()) {
      throw new ValidationError("Invitation is expired or already used");
    }

    const member = await db.$transaction(async (tx) => {
      const newMember = await tx.organizationMember.create({
        data: {
          orgId: invitation.orgId,
          userId,
          role: invitation.role,
          invitedBy: invitation.invitedById,
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });

      return newMember;
    });

    return member;
  }

  async removeMember(orgId: string, userId: string): Promise<void> {
    const member = await db.organizationMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });

    if (!member) {
      throw new NotFoundError("Member not found in this organization");
    }

    await db.organizationMember.delete({
      where: { orgId_userId: { orgId, userId } },
    });
  }

  async listMembers(orgId: string): Promise<MemberWithUser[]> {
    const members = await db.organizationMember.findMany({
      where: { orgId },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    return members.map((m) => ({
      orgId: m.orgId,
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      invitedBy: m.invitedBy,
      user: m.user,
    }));
  }
}
