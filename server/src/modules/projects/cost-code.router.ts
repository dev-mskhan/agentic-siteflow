import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { costCodeRepository } from "./cost-code.repository.js";
import { CostCodeService } from "./cost-code.service.js";
import { auditService } from "../audit/audit.router.js";
import { ConflictError, NotFoundError, ValidationError } from "../../common/index.js";

export const costCodeService = new CostCodeService(costCodeRepository, auditService);

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
  throw err;
}

const createCostCodeSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  category: z.string().optional(),
  parentId: z.string().optional(),
});

const updateCostCodeSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  parentId: z.string().optional(),
});

export const costCodeRouter = router({
  /**
   * Create a new cost code for the org.
   */
  create: authedProcedure.input(createCostCodeSchema).mutation(async ({ input, ctx }) => {
    try {
      return await costCodeService.createCostCode(ctx.user!.orgId, ctx.user!.id, input);
    } catch (err) {
      mapError(err);
    }
  }),

  /**
   * List all active cost codes for the org.
   */
  list: authedProcedure.query(async ({ ctx }) => {
    try {
      return await costCodeService.listCostCodes(ctx.user!.orgId);
    } catch (err) {
      mapError(err);
    }
  }),

  /**
   * Update a cost code.
   */
  update: authedProcedure
    .input(z.object({ id: z.string().min(1) }).merge(updateCostCodeSchema))
    .mutation(async ({ input, ctx }) => {
      const { id, ...rest } = input;
      try {
        return await costCodeService.updateCostCode(ctx.user!.orgId, ctx.user!.id, id, rest);
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Deactivate a cost code.
   */
  deactivate: authedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await costCodeService.deactivateCostCode(ctx.user!.orgId, ctx.user!.id, input.id);
      } catch (err) {
        mapError(err);
      }
    }),
});
