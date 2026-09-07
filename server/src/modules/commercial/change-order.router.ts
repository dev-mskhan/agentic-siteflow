import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { ChangeOrderStatus, ChangeOrderType } from "@prisma/client";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { changeOrderService } from "./change-order.service.js";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  ForbiddenError,
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
  if (err instanceof ForbiddenError) {
    throw new TRPCError({ code: "FORBIDDEN", message: err.message });
  }
  if (err instanceof UnauthorizedError) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: err.message });
  }
  throw err;
}

const cuidSchema = z.string().cuid();

const createChangeOrderSchema = z.object({
  projectId: cuidSchema,
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  reason: z.string().max(500).optional(),
  type: z.nativeEnum(ChangeOrderType).optional(),
  scheduleDeltaDays: z.number().int().optional(),
  subcontractorId: cuidSchema.optional(),
  contractId: cuidSchema.optional(),
  items: z.array(
    z.object({
      costCodeId: cuidSchema.optional(),
      description: z.string().min(1).max(300),
      quantity: z.number(),
      unitPrice: z.number(),
    }),
  ).min(1),
});

const listChangeOrdersSchema = z.object({
  projectId: cuidSchema.optional(),
  type: z.nativeEnum(ChangeOrderType).optional(),
  status: z.nativeEnum(ChangeOrderStatus).optional(),
  subcontractorId: cuidSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50).optional(),
  offset: z.number().int().min(0).default(0).optional(),
});

export const changeOrderRouter = router({
  create: authedProcedure
    .input(createChangeOrderSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await changeOrderService.create(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  get: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await changeOrderService.get(ctx.user!.orgId, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  list: authedProcedure
    .input(listChangeOrdersSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await changeOrderService.list(ctx.user!.orgId, input);
      } catch (err) {
        mapError(err);
      }
    }),

  submit: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await changeOrderService.submit(ctx.user!.orgId, ctx.user!.id, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  approve: authedProcedure
    .input(
      z.object({
        id: cuidSchema,
        clientReferenceNumber: z.string().optional(),
        clientApproved: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await changeOrderService.approve(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  reject: authedProcedure
    .input(z.object({ id: cuidSchema, rejectionReason: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await changeOrderService.reject(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),
});
