import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { InvoiceStatus, InvoiceType, PaymentMethod } from "@prisma/client";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { invoiceService } from "./invoice.service.js";
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

const createInvoiceSchema = z.object({
  projectId: cuidSchema,
  invoiceNumber: z.string().min(1).max(50),
  type: z.nativeEnum(InvoiceType),
  vendorId: cuidSchema.optional(),
  subcontractorId: cuidSchema.optional(),
  purchaseOrderId: cuidSchema.optional(),
  paymentApplicationId: cuidSchema.optional(),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  subtotal: z.number().positive(),
  taxAmount: z.number().min(0).optional(),
  retainageWithheld: z.number().min(0).optional(),
  notes: z.string().max(1000).optional(),
});

const listInvoicesSchema = z.object({
  projectId: cuidSchema.optional(),
  type: z.nativeEnum(InvoiceType).optional(),
  status: z.nativeEnum(InvoiceStatus).optional(),
  vendorId: cuidSchema.optional(),
  subcontractorId: cuidSchema.optional(),
  isOverdue: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(50).optional(),
  offset: z.number().int().min(0).default(0).optional(),
});

const recordPaymentSchema = z.object({
  invoiceId: cuidSchema,
  amount: z.number().positive(),
  paymentDate: z.coerce.date(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  referenceNumber: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  costCodeId: cuidSchema.optional(),
});

export const invoiceRouter = router({
  create: authedProcedure
    .input(createInvoiceSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await invoiceService.createInvoice(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  get: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await invoiceService.getInvoice(ctx.user!.orgId, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  list: authedProcedure
    .input(listInvoicesSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await invoiceService.listInvoices(ctx.user!.orgId, input);
      } catch (err) {
        mapError(err);
      }
    }),

  approve: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await invoiceService.approveInvoice(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),
});

export const paymentRouter = router({
  record: authedProcedure
    .input(recordPaymentSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await invoiceService.recordPayment(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  list: authedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50).optional(),
        offset: z.number().int().min(0).default(0).optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await invoiceService.listPayments(ctx.user!.orgId, input?.limit, input?.offset);
      } catch (err) {
        mapError(err);
      }
    }),
});
