import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { RfiDiscipline, RfiPriority, RfiStatus } from "@prisma/client";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { rfiService } from "./rfi.service.js";
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

export const createRfiSchema = z.object({
  projectId: cuidSchema,
  title: z.string().min(1).max(255),
  question: z.string().min(1).max(5000),
  suggestedSolution: z.string().max(5000).optional(),
  discipline: z.nativeEnum(RfiDiscipline).optional(),
  priority: z.nativeEnum(RfiPriority).optional(),
  dueDate: z.coerce.date().optional(),
  scheduleImpactDays: z.number().int().min(0).optional(),
  costImpactAmount: z.number().min(0).optional(),
  linkedTaskId: cuidSchema.optional(),
  assignedToId: cuidSchema.optional(),
});

export const updateRfiSchema = z.object({
  id: cuidSchema,
  title: z.string().min(1).max(255).optional(),
  question: z.string().min(1).max(5000).optional(),
  suggestedSolution: z.string().max(5000).nullable().optional(),
  discipline: z.nativeEnum(RfiDiscipline).optional(),
  priority: z.nativeEnum(RfiPriority).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  scheduleImpactDays: z.number().int().min(0).nullable().optional(),
  costImpactAmount: z.number().min(0).nullable().optional(),
  linkedTaskId: cuidSchema.nullable().optional(),
  assignedToId: cuidSchema.nullable().optional(),
});

export const addRfiResponseSchema = z.object({
  rfiId: cuidSchema,
  responseContent: z.string().min(1).max(5000),
});

export const answerRfiSchema = z.object({
  rfiId: cuidSchema,
  answerContent: z.string().min(1).max(5000),
});

export const listRfisSchema = z.object({
  projectId: cuidSchema.optional(),
  status: z.nativeEnum(RfiStatus).optional(),
  discipline: z.nativeEnum(RfiDiscipline).optional(),
  priority: z.nativeEnum(RfiPriority).optional(),
  assignedToId: cuidSchema.optional(),
  requestedById: cuidSchema.optional(),
  search: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const rfiRouter = router({
  create: authedProcedure
    .input(createRfiSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await rfiService.createRfi(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  update: authedProcedure
    .input(updateRfiSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      try {
        return await rfiService.updateRfi(ctx.user!.orgId, id, ctx.user!.id, data);
      } catch (err) {
        mapError(err);
      }
    }),

  addResponse: authedProcedure
    .input(addRfiResponseSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await rfiService.addResponse(
          ctx.user!.orgId,
          input.rfiId,
          ctx.user!.id,
          input.responseContent,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  markAnswered: authedProcedure
    .input(answerRfiSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await rfiService.markAnswered(
          ctx.user!.orgId,
          input.rfiId,
          ctx.user!.id,
          input.answerContent,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  close: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await rfiService.closeRfi(ctx.user!.orgId, input.id, ctx.user!.id);
      } catch (err) {
        mapError(err);
      }
    }),

  get: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await rfiService.getRfi(ctx.user!.orgId, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  list: authedProcedure
    .input(listRfisSchema.optional())
    .query(async ({ ctx, input }) => {
      try {
        return await rfiService.listRfis(ctx.user!.orgId, input);
      } catch (err) {
        mapError(err);
      }
    }),

  auditHistory: authedProcedure
    .input(
      z.object({
        rfiId: cuidSchema,
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        await rfiService.getRfi(ctx.user!.orgId, input.rfiId);
        return await auditRepository.findByEntity(
          "rfi",
          input.rfiId,
          input.limit,
          input.offset,
          ctx.user!.orgId,
        );
      } catch (err) {
        mapError(err);
      }
    }),
});
