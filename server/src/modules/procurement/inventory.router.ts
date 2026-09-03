import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { InventoryTransactionType } from "@prisma/client";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { inventoryService } from "./inventory.service.js";
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

const recordTransactionSchema = z.object({
  projectId: cuidSchema,
  materialId: cuidSchema,
  type: z.nativeEnum(InventoryTransactionType),
  quantity: z.number(),
  unit: z.string().max(50).optional(),
  unitCost: z.number().nonnegative().optional(),
  referenceType: z.string().max(100).optional(),
  referenceId: z.string().max(100).optional(),
  costCodeId: cuidSchema.optional(),
  notes: z.string().max(2000).optional(),
});

const getStockSchema = z.object({
  projectId: cuidSchema,
  materialId: cuidSchema.optional(),
});

const listTransactionsSchema = z.object({
  projectId: cuidSchema,
  materialId: cuidSchema.optional(),
  type: z.nativeEnum(InventoryTransactionType).optional(),
  referenceType: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(100).default(50).optional(),
  offset: z.number().int().min(0).default(0).optional(),
});

const recordTaskConsumptionSchema = z.object({
  projectId: cuidSchema,
  taskId: cuidSchema,
  materialId: cuidSchema,
  quantity: z.number().positive(),
  notes: z.string().max(1000).optional(),
});

export const inventoryRouter = router({
  /**
   * 5.7.7 — Record an inventory transaction
   */
  recordTransaction: authedProcedure
    .input(recordTransactionSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { projectId, ...data } = input;
        return await inventoryService.recordTransaction(
          ctx.user!.orgId,
          projectId,
          ctx.user!.id,
          data,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * 5.7.7 — Get project stock levels (optionally for a single material)
   */
  getStock: authedProcedure
    .input(getStockSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await inventoryService.getProjectStock(
          ctx.user!.orgId,
          input.projectId,
          input.materialId,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * 5.7.7 — List transactions for a project with optional filters
   */
  listTransactions: authedProcedure
    .input(listTransactionsSchema)
    .query(async ({ ctx, input }) => {
      try {
        const { projectId, ...filters } = input;
        return await inventoryService.listTransactions(
          ctx.user!.orgId,
          projectId,
          filters,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * 5.7.7 — Record material consumption linked to a task
   */
  recordTaskConsumption: authedProcedure
    .input(recordTaskConsumptionSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await inventoryService.recordConsumptionFromTask(
          ctx.user!.orgId,
          input.projectId,
          input.taskId,
          input.materialId,
          input.quantity,
          ctx.user!.id,
          input.notes,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Fetch append-only audit history for an inventory transaction
   */
  auditHistory: authedProcedure
    .input(
      z.object({
        entityId: cuidSchema,
        limit: z.number().int().min(1).max(100).default(50).optional(),
        offset: z.number().int().min(0).default(0).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await auditRepository.findByEntity(
          "inventory_transaction",
          input.entityId,
          input.limit,
          input.offset,
          ctx.user!.orgId,
        );
      } catch (err) {
        mapError(err);
      }
    }),
});
