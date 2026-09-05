import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { ComplianceType, ComplianceStatus } from "@prisma/client";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { complianceService } from "./compliance.service.js";
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

export const createComplianceSchema = z.object({
  projectId: cuidSchema.optional(),
  subcontractorId: cuidSchema.optional(),
  complianceType: z.nativeEnum(ComplianceType),
  title: z.string().min(1).max(255),
  referenceNumber: z.string().max(100).optional(),
  issuingAuthority: z.string().max(255).optional(),
  status: z.nativeEnum(ComplianceStatus).optional(),
  issueDate: z.coerce.date().optional(),
  expirationDate: z.coerce.date().optional(),
  reminderDays: z.number().int().min(1).max(365).optional(),
  responsibleUserId: cuidSchema.optional(),
  notes: z.string().max(5000).optional(),
});

export const updateComplianceSchema = z.object({
  id: cuidSchema,
  status: z.nativeEnum(ComplianceStatus).optional(),
  title: z.string().min(1).max(255).optional(),
  referenceNumber: z.string().max(100).optional(),
  issuingAuthority: z.string().max(255).optional(),
  issueDate: z.coerce.date().nullable().optional(),
  expirationDate: z.coerce.date().nullable().optional(),
  reminderDays: z.number().int().min(1).max(365).optional(),
  responsibleUserId: cuidSchema.nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export const listComplianceSchema = z.object({
  projectId: cuidSchema.optional(),
  subcontractorId: cuidSchema.optional(),
  complianceType: z.nativeEnum(ComplianceType).optional(),
  status: z.nativeEnum(ComplianceStatus).optional(),
  expiringWithinDays: z.number().int().min(1).max(365).optional(),
  search: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const complianceRouter = router({
  create: authedProcedure
    .input(createComplianceSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await complianceService.createComplianceRecord(
          ctx.user!.orgId,
          ctx.user!.id,
          input,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  update: authedProcedure
    .input(updateComplianceSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      try {
        return await complianceService.updateComplianceRecord(
          ctx.user!.orgId,
          id,
          ctx.user!.id,
          data,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  get: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await complianceService.getComplianceRecord(ctx.user!.orgId, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  list: authedProcedure
    .input(listComplianceSchema.optional())
    .query(async ({ ctx, input }) => {
      try {
        return await complianceService.listComplianceRecords(ctx.user!.orgId, input);
      } catch (err) {
        mapError(err);
      }
    }),

  getExpiring: authedProcedure
    .input(z.object({ windowDays: z.number().int().min(1).max(365).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      try {
        return await complianceService.getExpiringRecords(ctx.user!.orgId, input?.windowDays);
      } catch (err) {
        mapError(err);
      }
    }),

  auditHistory: authedProcedure
    .input(
      z.object({
        recordId: cuidSchema,
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        await complianceService.getComplianceRecord(ctx.user!.orgId, input.recordId);
        return await auditRepository.findByEntity(
          "compliance_record",
          input.recordId,
          input.limit,
          input.offset,
          ctx.user!.orgId,
        );
      } catch (err) {
        mapError(err);
      }
    }),
});
