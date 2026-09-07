import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { budgetService } from "./budget.service.js";
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

const setBudgetSchema = z.object({
  projectId: cuidSchema,
  items: z.array(
    z.object({
      costCodeId: cuidSchema,
      originalAmount: z.number().min(0),
      notes: z.string().max(500).optional(),
    }),
  ).min(1),
});

const updateBudgetItemSchema = z.object({
  id: cuidSchema,
  originalAmount: z.number().min(0).optional(),
  notes: z.string().max(500).optional(),
});

export const budgetRouter = router({
  setBudget: authedProcedure
    .input(setBudgetSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await budgetService.setBudget(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  getProjectBudget: authedProcedure
    .input(z.object({ projectId: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await budgetService.getProjectBudget(ctx.user!.orgId, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  updateBudgetItem: authedProcedure
    .input(updateBudgetItemSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      try {
        return await budgetService.updateBudgetItem(ctx.user!.orgId, ctx.user!.id, id, data);
      } catch (err) {
        mapError(err);
      }
    }),

  listBudgetItems: authedProcedure
    .input(z.object({ projectId: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await budgetService.listBudgetItems(ctx.user!.orgId, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),
});
