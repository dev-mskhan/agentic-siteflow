import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { materialService } from "./material.service.js";
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

const createMaterialSchema = z.object({
  name: z.string().min(1).max(200),
  itemCode: z.string().max(50).optional(),
  description: z.string().max(1000).optional(),
  category: z.string().min(1).max(100),
  unit: z.string().min(1).max(30),
  standardCost: z.number().nonnegative().optional(),
  currency: z.string().max(10).optional(),
  preferredVendorId: cuidSchema.optional(),
  costCodeId: cuidSchema.optional(),
  minStockLevel: z.number().nonnegative().optional(),
});

const updateMaterialSchema = z.object({
  id: cuidSchema,
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  category: z.string().min(1).max(100).optional(),
  unit: z.string().min(1).max(30).optional(),
  standardCost: z.number().nonnegative().optional(),
  currency: z.string().max(10).optional(),
  preferredVendorId: cuidSchema.nullable().optional(),
  costCodeId: cuidSchema.nullable().optional(),
  minStockLevel: z.number().nonnegative().nullable().optional(),
  isActive: z.boolean().optional(),
});

const listMaterialsSchema = z.object({
  category: z.string().optional(),
  isActive: z.boolean().optional(),
  search: z.string().optional(),
  preferredVendorId: cuidSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const materialRouter = router({
  create: authedProcedure
    .input(createMaterialSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await materialService.createMaterial(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  get: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await materialService.getMaterial(ctx.user!.orgId, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  list: authedProcedure
    .input(listMaterialsSchema.optional())
    .query(async ({ ctx, input }) => {
      try {
        return await materialService.listMaterials(ctx.user!.orgId, input);
      } catch (err) {
        mapError(err);
      }
    }),

  update: authedProcedure
    .input(updateMaterialSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      try {
        return await materialService.updateMaterial(ctx.user!.orgId, id, ctx.user!.id, data);
      } catch (err) {
        mapError(err);
      }
    }),

  archive: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await materialService.archiveMaterial(ctx.user!.orgId, input.id, ctx.user!.id);
      } catch (err) {
        mapError(err);
      }
    }),

  auditHistory: authedProcedure
    .input(
      z.object({
        materialId: cuidSchema,
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        await materialService.getMaterial(ctx.user!.orgId, input.materialId);
        return await auditRepository.findByEntity(
          "material",
          input.materialId,
          input.limit,
          input.offset,
          ctx.user!.orgId,
        );
      } catch (err) {
        mapError(err);
      }
    }),
});
