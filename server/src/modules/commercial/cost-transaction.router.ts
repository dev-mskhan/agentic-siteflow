import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { CostTransactionStatus, CostTransactionType } from "@prisma/client";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { costTransactionService } from "./cost-transaction.service.js";
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

const recordCostTransactionSchema = z.object({
  projectId: cuidSchema,
  costCodeId: cuidSchema,
  transactionType: z.nativeEnum(CostTransactionType),
  amount: z.number().positive(),
  currency: z.string().default("USD").optional(),
  transactionDate: z.coerce.date(),
  description: z.string().min(1).max(500),
  referenceNumber: z.string().max(100).optional(),
  vendorId: cuidSchema.optional(),
  subcontractorId: cuidSchema.optional(),
  purchaseOrderId: cuidSchema.optional(),
  taskId: cuidSchema.optional(),
  invoiceId: cuidSchema.optional(),
});

const listCostTransactionsSchema = z.object({
  projectId: cuidSchema.optional(),
  costCodeId: cuidSchema.optional(),
  transactionType: z.nativeEnum(CostTransactionType).optional(),
  status: z.nativeEnum(CostTransactionStatus).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.number().int().min(1).max(100).default(50).optional(),
  offset: z.number().int().min(0).default(0).optional(),
});

export const costTransactionRouter = router({
  record: authedProcedure
    .input(recordCostTransactionSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await costTransactionService.recordTransaction(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  get: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await costTransactionService.getTransaction(ctx.user!.orgId, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  list: authedProcedure
    .input(listCostTransactionsSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await costTransactionService.listTransactions(ctx.user!.orgId, input);
      } catch (err) {
        mapError(err);
      }
    }),

  void: authedProcedure
    .input(z.object({ id: cuidSchema, voidReason: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await costTransactionService.voidTransaction(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  getActualCostSummary: authedProcedure
    .input(z.object({ projectId: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await costTransactionService.getActualCostSummary(ctx.user!.orgId, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),
});
