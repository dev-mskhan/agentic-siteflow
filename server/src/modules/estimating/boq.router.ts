import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { boqItemRepository } from "./boq-item.repository.js";
import { auditService } from "../audit/audit.router.js";
import { BoqService } from "./boq.service.js";
import { estimateService } from "./estimate.router.js";
import { ConflictError, NotFoundError, ValidationError, UnauthorizedError } from "../../common/index.js";

export const boqService = new BoqService(boqItemRepository, estimateService, auditService);

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

// ─── Input schemas ─────────────────────────────────────────────────────────────

const addItemSchema = z.object({
  estimateId: z.string().cuid(),
  description: z.string().min(1),
  unit: z.string().min(1).max(20),
  quantity: z.number().positive(),
  itemCode: z.string().optional(),
  category: z.string().optional(),
  materialRate: z.number().min(0).optional(),
  laborRate: z.number().min(0).optional(),
  equipmentRate: z.number().min(0).optional(),
  subcontractorRate: z.number().min(0).optional(),
  markupPercent: z.number().min(0).max(100).optional(),
  phaseId: z.string().cuid().optional(),
  costCodeId: z.string().cuid().optional(),
  notes: z.string().optional(),
});

const updateItemSchema = z.object({
  estimateId: z.string().cuid(),
  itemId: z.string().cuid(),
  description: z.string().min(1).optional(),
  unit: z.string().min(1).max(20).optional(),
  quantity: z.number().positive().optional(),
  itemCode: z.string().optional(),
  category: z.string().optional(),
  materialRate: z.number().min(0).optional(),
  laborRate: z.number().min(0).optional(),
  equipmentRate: z.number().min(0).optional(),
  subcontractorRate: z.number().min(0).optional(),
  markupPercent: z.number().min(0).max(100).optional(),
  phaseId: z.string().cuid().optional(),
  costCodeId: z.string().cuid().optional(),
  notes: z.string().optional(),
});

const deleteItemSchema = z.object({
  estimateId: z.string().cuid(),
  itemId: z.string().cuid(),
});

const reorderSchema = z.object({
  estimateId: z.string().cuid(),
  orderedIds: z.array(z.string().cuid()).min(1),
});

// ─── Router ────────────────────────────────────────────────────────────────────

export const boqRouter = router({
  /**
   * Add a BOQ item to an estimate.
   */
  addItem: authedProcedure.input(addItemSchema).mutation(async ({ input, ctx }) => {
    const { estimateId, ...rest } = input;
    try {
      return await boqService.addItem(ctx.user!.orgId, estimateId, ctx.user!.id, rest);
    } catch (err) {
      mapError(err);
    }
  }),

  /**
   * Update a BOQ item.
   */
  updateItem: authedProcedure.input(updateItemSchema).mutation(async ({ input, ctx }) => {
    const { estimateId, itemId, ...rest } = input;
    try {
      return await boqService.updateItem(
        ctx.user!.orgId,
        estimateId,
        itemId,
        ctx.user!.id,
        rest,
      );
    } catch (err) {
      mapError(err);
    }
  }),

  /**
   * Delete a BOQ item.
   */
  deleteItem: authedProcedure.input(deleteItemSchema).mutation(async ({ input, ctx }) => {
    try {
      await boqService.deleteItem(
        ctx.user!.orgId,
        input.estimateId,
        input.itemId,
        ctx.user!.id,
      );
      return { success: true };
    } catch (err) {
      mapError(err);
    }
  }),

  /**
   * List all BOQ items for an estimate.
   */
  listItems: authedProcedure
    .input(z.object({ estimateId: z.string().cuid() }))
    .query(async ({ input, ctx }) => {
      try {
        return await boqService.listItems(ctx.user!.orgId, input.estimateId);
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Reorder BOQ items.
   */
  reorderItems: authedProcedure.input(reorderSchema).mutation(async ({ input, ctx }) => {
    try {
      await boqService.reorderItems(
        ctx.user!.orgId,
        input.estimateId,
        input.orderedIds,
        ctx.user!.id,
      );
      return { success: true };
    } catch (err) {
      mapError(err);
    }
  }),
});
