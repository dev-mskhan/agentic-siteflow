import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { SovType } from "@prisma/client";
import { router, authedProcedure, permissionProcedure } from "../../api/trpc/trpc.js";
import { sovService } from "./sov.service.js";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  ForbiddenError,
} from "../../common/index.js";
import { Permissions } from "../auth/permissions.js";

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

const createSovSchema = z.object({
  projectId: cuidSchema,
  contractId: cuidSchema.optional(),
  subcontractorId: cuidSchema.optional(),
  type: z.nativeEnum(SovType).optional(),
  title: z.string().min(1).max(200),
  items: z.array(
    z.object({
      itemNumber: z.string().min(1).max(50),
      description: z.string().min(1).max(300),
      costCodeId: cuidSchema.optional(),
      scheduledValue: z.number().min(0),
    }),
  ).min(1),
});

export const sovRouter = router({
  create: permissionProcedure(Permissions.SOV_MANAGE)
    .input(createSovSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await sovService.create(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  get: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await sovService.get(ctx.user!.orgId, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  listByProject: authedProcedure
    .input(z.object({ projectId: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await sovService.listByProject(ctx.user!.orgId, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  activate: permissionProcedure(Permissions.SOV_MANAGE)
    .input(z.object({ id: cuidSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await sovService.activate(ctx.user!.orgId, ctx.user!.id, input.id);
      } catch (err) {
        mapError(err);
      }
    }),
});
