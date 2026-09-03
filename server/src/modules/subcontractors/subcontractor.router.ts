import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { SubcontractorContractStatus, SubcontractorStatus } from "@prisma/client";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { subcontractorService } from "./subcontractor.service.js";
import { partnerPerformanceService } from "./partner-performance.service.js";
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
  throw err;
}

const cuidSchema = z.string().cuid();
const optionalDate = z.coerce.date().optional();
const nullableDate = z.coerce.date().nullable().optional();

const createSubcontractorSchema = z.object({
  companyName: z.string().min(1).max(200),
  trade: z.string().min(1).max(100),
  contactName: z.string().max(100).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(50).optional(),
  address: z.string().max(300).optional(),
  taxId: z.string().max(50).optional(),
  licenseNumber: z.string().max(100).optional(),
  licenseExpiry: optionalDate,
  insurancePolicyNumber: z.string().max(100).optional(),
  insuranceExpiry: optionalDate,
  notes: z.string().max(1000).optional(),
});

const updateSubcontractorSchema = z.object({
  id: cuidSchema,
  companyName: z.string().min(1).max(200).optional(),
  trade: z.string().min(1).max(100).optional(),
  contactName: z.string().max(100).nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  contactPhone: z.string().max(50).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  taxId: z.string().max(50).nullable().optional(),
  status: z.nativeEnum(SubcontractorStatus).optional(),
  licenseNumber: z.string().max(100).nullable().optional(),
  licenseExpiry: nullableDate,
  insurancePolicyNumber: z.string().max(100).nullable().optional(),
  insuranceExpiry: nullableDate,
  isCompliant: z.boolean().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const listSubcontractorsSchema = z.object({
  trade: z.string().optional(),
  status: z.nativeEnum(SubcontractorStatus).optional(),
  isCompliant: z.boolean().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

const createContractSchema = z.object({
  projectId: cuidSchema,
  subcontractorId: cuidSchema,
  scopeOfWork: z.string().min(1).max(2000),
  contractValue: z.number().nonnegative(),
  retainagePercent: z.number().min(0).max(1).optional(),
  startDate: optionalDate,
  endDate: optionalDate,
  costCodeId: cuidSchema.optional(),
});

const updateContractStatusSchema = z.object({
  contractId: cuidSchema,
  status: z.nativeEnum(SubcontractorContractStatus),
});

const assignTaskSchema = z.object({
  taskId: cuidSchema,
  subcontractorId: cuidSchema.nullable(),
});

export const subcontractorRouter = router({
  create: authedProcedure
    .input(createSubcontractorSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await subcontractorService.createSubcontractor(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  get: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await subcontractorService.getSubcontractor(ctx.user!.orgId, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  list: authedProcedure
    .input(listSubcontractorsSchema.optional())
    .query(async ({ ctx, input }) => {
      try {
        return await subcontractorService.listSubcontractors(ctx.user!.orgId, input);
      } catch (err) {
        mapError(err);
      }
    }),

  update: authedProcedure
    .input(updateSubcontractorSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      try {
        return await subcontractorService.updateSubcontractor(ctx.user!.orgId, id, ctx.user!.id, data);
      } catch (err) {
        mapError(err);
      }
    }),

  createContract: authedProcedure
    .input(createContractSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await subcontractorService.createContract(ctx.user!.orgId, input.projectId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  getContract: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await subcontractorService.getContract(ctx.user!.orgId, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  listContracts: authedProcedure
    .input(
      z.object({
        projectId: cuidSchema.optional(),
        subcontractorId: cuidSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        if (input.projectId) {
          return await subcontractorService.listContractsByProject(ctx.user!.orgId, input.projectId);
        }
        if (input.subcontractorId) {
          return await subcontractorService.listContractsBySubcontractor(ctx.user!.orgId, input.subcontractorId);
        }
        throw new ValidationError("Either projectId or subcontractorId must be provided");
      } catch (err) {
        mapError(err);
      }
    }),

  updateContractStatus: authedProcedure
    .input(updateContractStatusSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await subcontractorService.updateContractStatus(
          ctx.user!.orgId,
          input.contractId,
          input.status,
          ctx.user!.id,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  assignTask: authedProcedure
    .input(assignTaskSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await subcontractorService.assignTaskSubcontractor(
          ctx.user!.orgId,
          input.taskId,
          input.subcontractorId,
          ctx.user!.id,
        );
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),

  auditHistory: authedProcedure
    .input(
      z.object({
        subcontractorId: cuidSchema,
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        await subcontractorService.getSubcontractor(ctx.user!.orgId, input.subcontractorId);
        return await auditRepository.findByEntity(
          "subcontractor",
          input.subcontractorId,
          input.limit,
          input.offset,
          ctx.user!.orgId,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * 5.9.7 — Evaluate subcontractor performance
   */
  evaluate: authedProcedure
    .input(
      z.object({
        subcontractorId: cuidSchema,
        projectId: cuidSchema.optional(),
        qualityRating: z.number().int().min(1).max(5),
        timelinessRating: z.number().int().min(1).max(5),
        communicationRating: z.number().int().min(1).max(5),
        safetyRating: z.number().int().min(1).max(5).optional(),
        comments: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await partnerPerformanceService.evaluatePartner(
          ctx.user!.orgId,
          ctx.user!.id,
          {
            partnerType: "SUBCONTRACTOR",
            ...input,
          },
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * 5.9.7 — Get subcontractor performance metrics
   */
  getPerformance: authedProcedure
    .input(z.object({ subcontractorId: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await partnerPerformanceService.getSubcontractorPerformanceMetrics(
          ctx.user!.orgId,
          input.subcontractorId,
        );
      } catch (err) {
        mapError(err);
      }
    }),
});
