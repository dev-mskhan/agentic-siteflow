import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  InspectionStatus,
  DeficiencySeverity,
  DeficiencyStatus,
} from "@prisma/client";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { qualityService } from "./quality.service.js";
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

const checklistItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  passed: z.boolean(),
  comment: z.string().optional(),
});

export const scheduleInspectionSchema = z.object({
  projectId: cuidSchema,
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  location: z.string().max(255).optional(),
  scheduledDate: z.coerce.date(),
  inspectorId: cuidSchema,
  linkedTaskId: cuidSchema.optional(),
  checklistItems: z.array(checklistItemSchema).optional(),
  notes: z.string().max(5000).optional(),
});

export const recordInspectionResultsSchema = z.object({
  inspectionId: cuidSchema,
  status: z.nativeEnum(InspectionStatus),
  checklistItems: z.array(checklistItemSchema).optional(),
  notes: z.string().max(5000).optional(),
  completedDate: z.coerce.date().optional(),
});

export const createDeficiencySchema = z.object({
  projectId: cuidSchema,
  inspectionId: cuidSchema.optional(),
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(5000),
  location: z.string().max(255).optional(),
  severity: z.nativeEnum(DeficiencySeverity).optional(),
  subcontractorId: cuidSchema.optional(),
  assignedToId: cuidSchema.optional(),
  dueDate: z.coerce.date().optional(),
});

export const resolveDeficiencySchema = z.object({
  deficiencyId: cuidSchema,
  correctiveAction: z.string().min(1).max(5000),
  status: z.nativeEnum(DeficiencyStatus).optional(),
});

export const listInspectionsSchema = z.object({
  projectId: cuidSchema.optional(),
  status: z.nativeEnum(InspectionStatus).optional(),
  inspectorId: cuidSchema.optional(),
  search: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const listDeficienciesSchema = z.object({
  projectId: cuidSchema.optional(),
  inspectionId: cuidSchema.optional(),
  status: z.nativeEnum(DeficiencyStatus).optional(),
  severity: z.nativeEnum(DeficiencySeverity).optional(),
  subcontractorId: cuidSchema.optional(),
  assignedToId: cuidSchema.optional(),
  search: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const qualityRouter = router({
  scheduleInspection: authedProcedure
    .input(scheduleInspectionSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await qualityService.scheduleInspection(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  recordInspectionResults: authedProcedure
    .input(recordInspectionResultsSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await qualityService.recordInspectionResults(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  getInspection: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await qualityService.getInspection(ctx.user!.orgId, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  listInspections: authedProcedure
    .input(listInspectionsSchema.optional())
    .query(async ({ ctx, input }) => {
      try {
        return await qualityService.listInspections(ctx.user!.orgId, input);
      } catch (err) {
        mapError(err);
      }
    }),

  createDeficiency: authedProcedure
    .input(createDeficiencySchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await qualityService.createDeficiency(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  resolveDeficiency: authedProcedure
    .input(resolveDeficiencySchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await qualityService.resolveDeficiency(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  getDeficiency: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await qualityService.getDeficiency(ctx.user!.orgId, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  listDeficiencies: authedProcedure
    .input(listDeficienciesSchema.optional())
    .query(async ({ ctx, input }) => {
      try {
        return await qualityService.listDeficiencies(ctx.user!.orgId, input);
      } catch (err) {
        mapError(err);
      }
    }),

  auditHistory: authedProcedure
    .input(
      z.object({
        entityId: cuidSchema,
        entityType: z.enum(["quality_inspection", "deficiency"]),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await auditRepository.findByEntity(
          input.entityType,
          input.entityId,
          input.limit,
          input.offset,
          ctx.user!.orgId,
        );
      } catch (err) {
        mapError(err);
      }
    }),
});
