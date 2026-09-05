import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { SubmittalType, SubmittalStatus } from "@prisma/client";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { submittalService } from "./submittal.service.js";
import { auditRepository } from "../audit/audit.repository.js";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
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
  if (err instanceof UnauthorizedError) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: err.message });
  }
  if (err instanceof TRPCError) {
    throw err;
  }
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: err instanceof Error ? err.message : "Internal server error",
  });
}

const cuidSchema = z.string().regex(/^[a-z0-9]+$/i, "Invalid ID format");

export const createSubmittalSchema = z.object({
  projectId: cuidSchema,
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  specSection: z.string().max(100).optional(),
  type: z.nativeEnum(SubmittalType).optional(),
  subcontractorId: cuidSchema.optional(),
  leadReviewerId: cuidSchema.optional(),
  dueDate: z.coerce.date().optional(),
  requiredOnSiteDate: z.coerce.date().optional(),
  linkedTaskId: cuidSchema.optional(),
});

export const createSubmittalRevisionSchema = z.object({
  submittalId: cuidSchema,
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional(),
  specSection: z.string().max(100).optional(),
  type: z.nativeEnum(SubmittalType).optional(),
  subcontractorId: cuidSchema.optional(),
  leadReviewerId: cuidSchema.optional(),
  dueDate: z.coerce.date().optional(),
  requiredOnSiteDate: z.coerce.date().optional(),
  linkedTaskId: cuidSchema.optional(),
});

export const submitSubmittalReviewSchema = z.object({
  submittalId: cuidSchema,
  status: z.nativeEnum(SubmittalStatus),
  comments: z.string().max(5000).optional(),
});

export const listSubmittalsSchema = z.object({
  projectId: cuidSchema.optional(),
  status: z.nativeEnum(SubmittalStatus).optional(),
  type: z.nativeEnum(SubmittalType).optional(),
  subcontractorId: cuidSchema.optional(),
  leadReviewerId: cuidSchema.optional(),
  specSection: z.string().max(100).optional(),
  search: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const submittalRouter = router({
  create: authedProcedure
    .input(createSubmittalSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await submittalService.createSubmittal(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  createRevision: authedProcedure
    .input(createSubmittalRevisionSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await submittalService.createRevision(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  submitReview: authedProcedure
    .input(submitSubmittalReviewSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await submittalService.submitReview(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  get: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await submittalService.getSubmittal(ctx.user!.orgId, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  list: authedProcedure
    .input(listSubmittalsSchema.optional())
    .query(async ({ ctx, input }) => {
      try {
        return await submittalService.listSubmittals(ctx.user!.orgId, input);
      } catch (err) {
        mapError(err);
      }
    }),

  auditHistory: authedProcedure
    .input(
      z.object({
        submittalId: cuidSchema,
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        await submittalService.getSubmittal(ctx.user!.orgId, input.submittalId);
        return await auditRepository.findByEntity(
          "submittal",
          input.submittalId,
          input.limit,
          input.offset,
          ctx.user!.orgId,
        );
      } catch (err) {
        mapError(err);
      }
    }),
});
