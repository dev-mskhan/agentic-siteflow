import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { userRepository } from "./user.repository.js";
import { UserService } from "./user.service.js";
import { ConflictError, NotFoundError } from "../../common/index.js";
import { checkOwnership } from "../auth/authorization.js";
import { Permissions } from "../auth/permissions.js";

const userService = new UserService(userRepository);

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
  throw err;
}

const updateUserSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional(),
  /** E.164 phone number for WhatsApp (e.g. +14155552671). Pass null to clear. */
  phone: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, "Phone must be in E.164 format (e.g. +14155552671)")
    .nullable()
    .optional(),
});

export const userRouter = router({
  /**
   * Get the currently authenticated user.
   * 1.3 — unaffected by the ownership check below.
   */
  me: authedProcedure.query(async ({ ctx }) => {
    try {
      return await userService.getUser(ctx.user!.id);
    } catch (err) {
      mapError(err);
    }
  }),

  /**
   * Update a user by ID.
   *
   * Access control (1.1 / 1.2):
   *  - Any user may update their own profile (USER_UPDATE_OWN).
   *  - Org admins holding USER_UPDATE may update any user in their org.
   *  - All other combinations → FORBIDDEN (prevents horizontal privilege escalation).
   */
  update: authedProcedure.input(updateUserSchema).mutation(async ({ ctx, input }) => {
    const { id, ...rest } = input;

    // 1.2 — ownership check: resourceOwnerId is the target user id
    const allowed = checkOwnership(
      ctx.user!.id,
      id,
      Permissions.USER_UPDATE,
      Permissions.USER_UPDATE_OWN,
      ctx.user!.role,
    );

    if (!allowed) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have permission to update this user",
      });
    }

    try {
      return await userService.updateUser(id, rest);
    } catch (err) {
      mapError(err);
    }
  }),
});
