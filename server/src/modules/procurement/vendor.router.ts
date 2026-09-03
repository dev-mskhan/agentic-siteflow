import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { VendorStatus } from "@prisma/client";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { vendorService } from "./vendor.service.js";
import { partnerPerformanceService } from "../subcontractors/partner-performance.service.js";
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

const createVendorSchema = z.object({
  name: z.string().min(1).max(200),
  contactPerson: z.string().max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  taxId: z.string().max(50).optional(),
  paymentTerms: z.string().max(100).optional(),
  currency: z.string().max(10).optional(),
  notes: z.string().max(1000).optional(),
});

const updateVendorSchema = z.object({
  id: cuidSchema,
  name: z.string().min(1).max(200).optional(),
  contactPerson: z.string().max(100).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  country: z.string().max(100).nullable().optional(),
  taxId: z.string().max(50).nullable().optional(),
  paymentTerms: z.string().max(100).nullable().optional(),
  currency: z.string().max(10).optional(),
  status: z.nativeEnum(VendorStatus).optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const listVendorsSchema = z.object({
  status: z.nativeEnum(VendorStatus).optional(),
  search: z.string().optional(),
  city: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const vendorRouter = router({
  create: authedProcedure
    .input(createVendorSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await vendorService.createVendor(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  get: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await vendorService.getVendor(ctx.user!.orgId, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  list: authedProcedure
    .input(listVendorsSchema.optional())
    .query(async ({ ctx, input }) => {
      try {
        return await vendorService.listVendors(ctx.user!.orgId, input);
      } catch (err) {
        mapError(err);
      }
    }),

  update: authedProcedure
    .input(updateVendorSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      try {
        return await vendorService.updateVendor(ctx.user!.orgId, id, ctx.user!.id, data);
      } catch (err) {
        mapError(err);
      }
    }),

  deactivate: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await vendorService.deactivateVendor(ctx.user!.orgId, input.id, ctx.user!.id);
      } catch (err) {
        mapError(err);
      }
    }),

  auditHistory: authedProcedure
    .input(
      z.object({
        vendorId: cuidSchema,
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        await vendorService.getVendor(ctx.user!.orgId, input.vendorId);
        return await auditRepository.findByEntity(
          "vendor",
          input.vendorId,
          input.limit,
          input.offset,
          ctx.user!.orgId,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * 5.9.7 — Evaluate vendor performance
   */
  evaluate: authedProcedure
    .input(
      z.object({
        vendorId: cuidSchema,
        projectId: cuidSchema.optional(),
        qualityRating: z.number().int().min(1).max(5),
        timelinessRating: z.number().int().min(1).max(5),
        communicationRating: z.number().int().min(1).max(5),
        comments: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await partnerPerformanceService.evaluatePartner(
          ctx.user!.orgId,
          ctx.user!.id,
          {
            partnerType: "VENDOR",
            ...input,
          },
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * 5.9.7 — Get vendor performance metrics
   */
  getPerformance: authedProcedure
    .input(z.object({ vendorId: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await partnerPerformanceService.getVendorPerformanceMetrics(
          ctx.user!.orgId,
          input.vendorId,
        );
      } catch (err) {
        mapError(err);
      }
    }),
});
