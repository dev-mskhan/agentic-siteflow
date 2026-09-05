import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  SafetyIncidentType,
  SafetyIncidentSeverity,
  SafetyIncidentStatus,
} from "@prisma/client";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { safetyService } from "./safety.service.js";
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

export const reportIncidentSchema = z.object({
  projectId: cuidSchema,
  incidentDate: z.coerce.date(),
  incidentType: z.nativeEnum(SafetyIncidentType),
  severity: z.nativeEnum(SafetyIncidentSeverity).optional(),
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(5000),
  location: z.string().max(255).optional(),
  isOshaRecordable: z.boolean().optional(),
  oshaForm300Category: z.string().max(100).optional(),
  lostWorkDays: z.number().int().min(0).optional(),
  restrictedWorkDays: z.number().int().min(0).optional(),
  affectedPersonName: z.string().max(255).optional(),
  affectedPersonType: z.string().max(50).optional(),
  subcontractorId: cuidSchema.optional(),
});

export const updateInvestigationSchema = z.object({
  incidentId: cuidSchema,
  status: z.nativeEnum(SafetyIncidentStatus).optional(),
  investigationSummary: z.string().min(1).max(5000),
  rootCause: z.string().max(5000).optional(),
  investigatedById: cuidSchema.optional(),
  closeIncident: z.boolean().optional(),
});

export const addCorrectiveActionSchema = z.object({
  incidentId: cuidSchema,
  actionDescription: z.string().min(1).max(5000),
  assignedToId: cuidSchema,
  dueDate: z.coerce.date(),
});

export const completeCorrectiveActionSchema = z.object({
  correctiveActionId: cuidSchema,
  verificationNotes: z.string().max(5000).optional(),
});

export const listIncidentsSchema = z.object({
  projectId: cuidSchema.optional(),
  incidentType: z.nativeEnum(SafetyIncidentType).optional(),
  severity: z.nativeEnum(SafetyIncidentSeverity).optional(),
  status: z.nativeEnum(SafetyIncidentStatus).optional(),
  isOshaRecordable: z.boolean().optional(),
  subcontractorId: cuidSchema.optional(),
  search: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const safetyRouter = router({
  reportIncident: authedProcedure
    .input(reportIncidentSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await safetyService.reportIncident(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  updateInvestigation: authedProcedure
    .input(updateInvestigationSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await safetyService.updateInvestigation(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  addCorrectiveAction: authedProcedure
    .input(addCorrectiveActionSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await safetyService.addCorrectiveAction(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  completeCorrectiveAction: authedProcedure
    .input(completeCorrectiveActionSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await safetyService.completeCorrectiveAction(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  getIncident: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await safetyService.getIncident(ctx.user!.orgId, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  listIncidents: authedProcedure
    .input(listIncidentsSchema.optional())
    .query(async ({ ctx, input }) => {
      try {
        return await safetyService.listIncidents(ctx.user!.orgId, input);
      } catch (err) {
        mapError(err);
      }
    }),

  auditHistory: authedProcedure
    .input(
      z.object({
        incidentId: cuidSchema,
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await auditRepository.findByEntity(
          "safety_incident",
          input.incidentId,
          input.limit,
          input.offset,
          ctx.user!.orgId,
        );
      } catch (err) {
        mapError(err);
      }
    }),
});
