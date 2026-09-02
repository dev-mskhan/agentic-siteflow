import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { rateCardRepository } from "./rate-card.repository.js";
import { laborRateRepository } from "./labor-rate.repository.js";
import { auditService } from "../audit/audit.router.js";
import { RateCardService } from "./rate-card.service.js";
import { LaborRateService } from "./labor-rate.service.js";
import { ConflictError, NotFoundError, ValidationError, UnauthorizedError } from "../../common/index.js";

export const rateCardService = new RateCardService(rateCardRepository, auditService);
export const laborRateService = new LaborRateService(laborRateRepository, auditService);

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

// ─── Router ────────────────────────────────────────────────────────────────────

export const ratesRouter = router({
  // ─── Rate Cards ─────────────────────────────────────────────────────────────

  /**
   * Create a new rate card.
   */
  createRateCard: authedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().optional(),
        currency: z.string().length(3).optional(),
        effectiveDate: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await rateCardService.createRateCard(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * List active rate cards for the org.
   */
  listRateCards: authedProcedure.query(async ({ ctx }) => {
    try {
      return await rateCardService.listRateCards(ctx.user!.orgId);
    } catch (err) {
      mapError(err);
    }
  }),

  /**
   * Add an item to a rate card.
   */
  addRateCardItem: authedProcedure
    .input(
      z.object({
        rateCardId: z.string().cuid(),
        type: z.string().min(1),
        code: z.string().optional(),
        description: z.string().min(1),
        unit: z.string().min(1),
        rate: z.number().positive(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { rateCardId, ...rest } = input;
      try {
        return await rateCardService.addRateCardItem(
          ctx.user!.orgId,
          rateCardId,
          ctx.user!.id,
          rest,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Update a rate card item.
   */
  updateRateCardItem: authedProcedure
    .input(
      z.object({
        rateCardId: z.string().cuid(),
        itemId: z.string().cuid(),
        type: z.string().optional(),
        code: z.string().optional(),
        description: z.string().optional(),
        unit: z.string().optional(),
        rate: z.number().positive().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { rateCardId, itemId, ...rest } = input;
      try {
        return await rateCardService.updateRateCardItem(
          ctx.user!.orgId,
          rateCardId,
          itemId,
          ctx.user!.id,
          rest,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Deactivate a rate card.
   */
  deactivateRateCard: authedProcedure
    .input(z.object({ rateCardId: z.string().cuid() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await rateCardService.deactivateRateCard(
          ctx.user!.orgId,
          input.rateCardId,
          ctx.user!.id,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  // ─── Labor Rates ─────────────────────────────────────────────────────────────

  /**
   * Create a labor rate.
   */
  createLaborRate: authedProcedure
    .input(
      z.object({
        classification: z.string().min(1),
        description: z.string().optional(),
        unit: z.string().optional(),
        rate: z.number().positive(),
        currency: z.string().length(3).optional(),
        effectiveDate: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await laborRateService.createLaborRate(ctx.user!.orgId, ctx.user!.id, input);
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * List active labor rates for the org.
   */
  listLaborRates: authedProcedure.query(async ({ ctx }) => {
    try {
      return await laborRateService.listLaborRates(ctx.user!.orgId);
    } catch (err) {
      mapError(err);
    }
  }),

  /**
   * Update a labor rate.
   */
  updateLaborRate: authedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        classification: z.string().optional(),
        description: z.string().optional(),
        unit: z.string().optional(),
        rate: z.number().positive().optional(),
        currency: z.string().length(3).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...rest } = input;
      try {
        return await laborRateService.updateLaborRate(ctx.user!.orgId, id, ctx.user!.id, rest);
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Deactivate a labor rate.
   */
  deactivateLaborRate: authedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await laborRateService.deactivateLaborRate(
          ctx.user!.orgId,
          input.id,
          ctx.user!.id,
        );
      } catch (err) {
        mapError(err);
      }
    }),
});
