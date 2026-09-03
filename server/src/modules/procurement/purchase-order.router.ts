import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { PurchaseOrderStatus } from "@prisma/client";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { purchaseOrderService } from "./purchase-order.service.js";
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

const createPoItemSchema = z.object({
  materialId: z.string().cuid().optional(),
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(20),
  unitPrice: z.number().nonnegative(),
  costCodeId: z.string().cuid().optional(),
  linkedTaskId: z.string().cuid().optional(),
  linkedBoqItemId: z.string().cuid().optional(),
});

const createPoSchema = z.object({
  projectId: cuidSchema,
  vendorId: cuidSchema,
  materialRequestId: cuidSchema.optional(),
  expectedDeliveryDate: z.coerce.date().optional(),
  currency: z.string().max(10).optional(),
  taxRate: z.number().min(0).max(1).optional(),
  shippingAmount: z.number().nonnegative().optional(),
  paymentTerms: z.string().max(100).optional(),
  shippingAddress: z.string().max(300).optional(),
  notes: z.string().max(2000).optional(),
  items: z.array(createPoItemSchema).min(1),
});

const listPosSchema = z.object({
  projectId: cuidSchema,
  status: z.nativeEnum(PurchaseOrderStatus).optional(),
  vendorId: cuidSchema.optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const purchaseOrderRouter = router({
  create: authedProcedure
    .input(createPoSchema)
    .mutation(async ({ ctx, input }) => {
      const { projectId, ...rest } = input;
      try {
        return await purchaseOrderService.createPO(
          ctx.user!.orgId,
          projectId,
          ctx.user!.id,
          { ...rest, projectId },
        );
      } catch (err) {
        mapError(err);
      }
    }),

  get: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await purchaseOrderService.getPO(ctx.user!.orgId, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  list: authedProcedure
    .input(listPosSchema)
    .query(async ({ ctx, input }) => {
      const { projectId, ...filters } = input;
      try {
        return await purchaseOrderService.listPOs(ctx.user!.orgId, projectId, filters);
      } catch (err) {
        mapError(err);
      }
    }),

  issue: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await purchaseOrderService.issuePO(
          ctx.user!.orgId,
          input.id,
          ctx.user!.id,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  cancel: authedProcedure
    .input(z.object({ id: cuidSchema, reason: z.string().max(1000).optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await purchaseOrderService.cancelPO(
          ctx.user!.orgId,
          input.id,
          ctx.user!.id,
          input.reason,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  auditHistory: authedProcedure
    .input(
      z.object({
        poId: cuidSchema,
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        await purchaseOrderService.getPO(ctx.user!.orgId, input.poId);
        return await auditRepository.findByEntity(
          "purchase_order",
          input.poId,
          input.limit,
          input.offset,
          ctx.user!.orgId,
        );
      } catch (err) {
        mapError(err);
      }
    }),
});
