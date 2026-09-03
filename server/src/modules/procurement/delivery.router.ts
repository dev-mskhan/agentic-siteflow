import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { DeliveryStatus } from "@prisma/client";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { deliveryService } from "./delivery.service.js";
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

const scheduleDeliveryItemSchema = z.object({
  poItemId: cuidSchema,
  quantityShipped: z.number().positive(),
});

const scheduleDeliverySchema = z.object({
  purchaseOrderId: cuidSchema,
  expectedDate: z.coerce.date(),
  deliveryNoteNumber: z.string().max(100).optional(),
  carrier: z.string().max(100).optional(),
  trackingNumber: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
  items: z.array(scheduleDeliveryItemSchema).min(1),
});

const recordDelaySchema = z.object({
  deliveryId: cuidSchema,
  newExpectedDate: z.coerce.date(),
  delayReason: z.string().min(1).max(1000),
});

const receiptItemSchema = z.object({
  receiptItemId: cuidSchema,
  quantityReceived: z.number().nonnegative(),
  quantityAccepted: z.number().nonnegative(),
  quantityRejected: z.number().nonnegative(),
  rejectionReason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

const receiveDeliverySchema = z.object({
  deliveryId: cuidSchema,
  actualDate: z.coerce.date().optional(),
  deliveryNoteNumber: z.string().max(100).optional(),
  receipts: z.array(receiptItemSchema).min(1),
});

const listByProjectSchema = z.object({
  projectId: cuidSchema,
  status: z.nativeEnum(DeliveryStatus).optional(),
  isDelayed: z.boolean().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const deliveryRouter = router({
  schedule: authedProcedure
    .input(scheduleDeliverySchema)
    .mutation(async ({ ctx, input }) => {
      const { purchaseOrderId, ...rest } = input;
      try {
        return await deliveryService.scheduleDelivery(
          ctx.user!.orgId,
          purchaseOrderId,
          ctx.user!.id,
          rest,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  recordDelay: authedProcedure
    .input(recordDelaySchema)
    .mutation(async ({ ctx, input }) => {
      const { deliveryId, ...rest } = input;
      try {
        return await deliveryService.recordDelay(
          ctx.user!.orgId,
          deliveryId,
          ctx.user!.id,
          rest,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  receive: authedProcedure
    .input(receiveDeliverySchema)
    .mutation(async ({ ctx, input }) => {
      const { deliveryId, ...rest } = input;
      try {
        return await deliveryService.receiveDelivery(
          ctx.user!.orgId,
          deliveryId,
          ctx.user!.id,
          rest,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  get: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await deliveryService.getDelivery(ctx.user!.orgId, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  listByPO: authedProcedure
    .input(z.object({ purchaseOrderId: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await deliveryService.listDeliveriesByPO(
          ctx.user!.orgId,
          input.purchaseOrderId,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  listByProject: authedProcedure
    .input(listByProjectSchema)
    .query(async ({ ctx, input }) => {
      const { projectId, ...filters } = input;
      try {
        return await deliveryService.listDeliveriesByProject(
          ctx.user!.orgId,
          projectId,
          filters,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  auditHistory: authedProcedure
    .input(
      z.object({
        deliveryId: cuidSchema,
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        await deliveryService.getDelivery(ctx.user!.orgId, input.deliveryId);
        return await auditRepository.findByEntity(
          "delivery",
          input.deliveryId,
          input.limit,
          input.offset,
          ctx.user!.orgId,
        );
      } catch (err) {
        mapError(err);
      }
    }),
});
