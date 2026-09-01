import type { Invitation, OrgRole } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";

export interface CreateInvitationInput {
  orgId: string;
  email: string;
  role: OrgRole;
  token: string;
  expiresAt: Date;
  invitedById: string;
}

/**
 * Repository layer for Invitation model.
 */
export class InvitationRepository {
  async create(input: CreateInvitationInput): Promise<Invitation> {
    return db.invitation.create({
      data: {
        orgId: input.orgId,
        email: input.email,
        role: input.role,
        token: input.token,
        expiresAt: input.expiresAt,
        invitedById: input.invitedById,
      },
    });
  }

  async findByToken(token: string): Promise<Invitation | null> {
    return db.invitation.findUnique({ where: { token } });
  }

  async findByOrgAndEmail(orgId: string, email: string): Promise<Invitation | null> {
    return db.invitation.findFirst({
      where: { orgId, email, status: "PENDING" },
    });
  }

  async accept(id: string): Promise<void> {
    await db.invitation.update({
      where: { id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
  }

  async revoke(id: string): Promise<void> {
    await db.invitation.update({
      where: { id },
      data: { status: "REVOKED" },
    });
  }

  async expireOld(): Promise<void> {
    await db.invitation.updateMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: new Date() },
      },
      data: { status: "EXPIRED" },
    });
  }
}

// Singleton instance
export const invitationRepository = new InvitationRepository();
