import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { PaymentApplicationStatus, PaymentApplicationType } from "@prisma/client";
import { router, authedProcedure, permissionProcedure } from "../../api/trpc/trpc.js";
import { paymentApplicationService } from "./payment-application.service.js";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  ForbiddenError,
} from "../../common/index.js";
import { Permissions } from "../auth/permissions.js";

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

const createPaymentAppSchema = z.object({
  projectId: cuidSchema,
  sovId: cuidSchema,
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  type: z.nativeEnum(PaymentApplicationType).optional(),
  subcontractorId: cuidSchema.optional(),
  contractId: cuidSchema.optional(),
  retainagePercent: z.number().min(0).max(1).optional(),
  lineItems: z.array(
    z.object({
      sovItemId: cuidSchema,
      workCompletedThisPeriod: z.number().min(0),
      materialsPresentlyStored: z.number().min(0).optional(),
    }),
  ).min(1),
});

const listPaymentAppSchema = z.object({
  projectId: cuidSchema.optional(),
  sovId: cuidSchema.optional(),
  status: z.nativeEnum(PaymentApplicationStatus).optional(),
  type: z.nativeEnum(PaymentApplicationType).optional(),
  subcontractorId: cuidSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50).optional(),
  offset: z.number().int().min(0).default(0).optional(),
});

export const paymentApplicationRouter = router({
  create: authedProcedure
    .input(createPaymentAppSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await paymentApplicationService.create(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  get: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await paymentApplicationService.get(ctx.user!.orgId, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  list: authedProcedure
    .input(listPaymentAppSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await paymentApplicationService.list(ctx.user!.orgId, input);
      } catch (err) {
        mapError(err);
      }
    }),

  submit: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await paymentApplicationService.submit(ctx.user!.orgId, ctx.user!.id, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  approve: permissionProcedure(Permissions.PAYMENT_APPLICATION_APPROVE)
    .input(z.object({ id: cuidSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await paymentApplicationService.approve(ctx.user!.orgId, ctx.user!.id, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  reject: permissionProcedure(Permissions.PAYMENT_APPLICATION_APPROVE)
    .input(z.object({ id: cuidSchema, rejectionReason: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await paymentApplicationService.reject(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),
});
