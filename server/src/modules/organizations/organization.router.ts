import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, authedProcedure } from "../../api/trpc/trpc.js";
import { organizationRepository } from "./organization.repository.js";
import { invitationRepository } from "./invitation.repository.js";
import { OrganizationService } from "./organization.service.js";
import { ConflictError, NotFoundError, ValidationError } from "../../common/index.js";

const orgService = new OrganizationService(organizationRepository, invitationRepository);

/**
 * Maps domain errors to tRPC errors.
 */
function mapError(err: unknown): never {
  if (err instanceof NotFoundError) {
    throw new TRPCError({ code: "NOT_FOUND", message: err.message });
  }
  if (err instanceof ConflictError) {
    throw new TRPCError({ code: "CONFLICT", message: err.message });
  }
  if (err instanceof ValidationError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  }
  throw err;
}

const createOrgSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50),
  plan: z.string().optional(),
});

const updateOrgSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  plan: z.string().optional(),
});

export const organizationRouter = router({
  /**
   * Create a new organization.
   */
  create: publicProcedure.input(createOrgSchema).mutation(async ({ input }) => {
    try {
      return await orgService.createOrganization(input);
    } catch (err) {
      mapError(err);
    }
  }),

  /**
   * Get an organization by ID.
   */
  get: authedProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ input }) => {
    try {
      return await orgService.getOrganization(input.id);
    } catch (err) {
      mapError(err);
    }
  }),

  /**
   * Update an organization.
   */
  update: authedProcedure.input(updateOrgSchema).mutation(async ({ input }) => {
    const { id, ...rest } = input;
    try {
      return await orgService.updateOrganization(id, rest);
    } catch (err) {
      mapError(err);
    }
  }),

  /**
   * Invite a user to this organization.
   */
  invite: authedProcedure
    .input(
      z.object({
        orgId: z.string().min(1),
        email: z.string().email(),
        role: z.enum(["ADMIN", "MEMBER", "BILLING"]).optional(),
        invitedById: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await orgService.inviteUser(input.orgId, {
          email: input.email,
          role: input.role,
          invitedById: input.invitedById,
        });
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Accept an invitation by token.
   */
  acceptInvite: authedProcedure
    .input(z.object({ token: z.string().min(1), userId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        return await orgService.acceptInvitation(input.token, input.userId);
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Remove a member from an organization.
   */
  removeMember: authedProcedure
    .input(z.object({ orgId: z.string().min(1), userId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        await orgService.removeMember(input.orgId, input.userId);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * List all members of an organization.
   */
  listMembers: authedProcedure
    .input(z.object({ orgId: z.string().min(1) }))
    .query(async ({ input }) => {
      try {
        return await orgService.listMembers(input.orgId);
      } catch (err) {
        mapError(err);
      }
    }),
});
