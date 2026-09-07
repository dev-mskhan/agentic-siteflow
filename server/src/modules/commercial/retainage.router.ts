import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { retainageService } from "./retainage.service.js";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  ForbiddenError,
} from "../../common/index.js";

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
  if (err instanceof ForbiddenError) {
    throw new TRPCError({ code: "FORBIDDEN", message: err.message });
  }
  if (err instanceof UnauthorizedError) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: err.message });
  }
  throw err;
}

const cuidSchema = z.string().cuid();

const requestRetainageSchema = z.object({
  projectId: cuidSchema,
  subcontractorId: cuidSchema.optional(),
  contractId: cuidSchema.optional(),
  amountToRelease: z.number().positive(),
  notes: z.string().max(500).optional(),
});

export const retainageRouter = router({
  getRetainageBalance: authedProcedure
    .input(
      z.object({
        projectId: cuidSchema,
        subcontractorId: cuidSchema.optional(),
        contractId: cuidSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await retainageService.getRetainageBalance(
          ctx.user!.orgId,
          input.projectId,
          input.subcontractorId,
          input.contractId,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  requestRelease: authedProcedure
    .input(requestRetainageSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await retainageService.requestRelease(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  approveRelease: authedProcedure
    .input(
      z.object({
        id: cuidSchema,
        lienWaiverVerified: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await retainageService.approveRelease(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  rejectRelease: authedProcedure
    .input(z.object({ id: cuidSchema, rejectionReason: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await retainageService.rejectRelease(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  listReleases: authedProcedure
    .input(
      z.object({
        projectId: cuidSchema,
        subcontractorId: cuidSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await retainageService.listReleases(
          ctx.user!.orgId,
          input.projectId,
          input.subcontractorId,
        );
      } catch (err) {
        mapError(err);
      }
    }),
});
