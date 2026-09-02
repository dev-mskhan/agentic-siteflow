import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { EstimateStatus } from "@prisma/client";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { estimateRepository } from "./estimate.repository.js";
import { estimateVersionRepository } from "./estimate-version.repository.js";
import { boqItemRepository } from "./boq-item.repository.js";
import { auditService } from "../audit/audit.router.js";
import { auditRepository } from "../audit/audit.repository.js";
import { EstimateService } from "./estimate.service.js";
import { ConflictError, NotFoundError, ValidationError, UnauthorizedError } from "../../common/index.js";
import { getAllUnits } from "./units.js";

export const estimateService = new EstimateService(
  estimateRepository,
  estimateVersionRepository,
  boqItemRepository,
  auditService,
);

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

const createEstimateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  clientName: z.string().optional(),
  clientContact: z.string().optional(),
  siteAddress: z.string().optional(),
  siteCity: z.string().optional(),
  siteCountry: z.string().optional(),
  currency: z.string().length(3).optional(),
  validUntil: z.coerce.date().optional(),
  notes: z.string().optional(),
  scope: z.string().optional(),
});

const updateEstimateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  clientName: z.string().optional(),
  clientContact: z.string().optional(),
  siteAddress: z.string().optional(),
  siteCity: z.string().optional(),
  siteCountry: z.string().optional(),
  currency: z.string().length(3).optional(),
  validUntil: z.coerce.date().optional(),
  notes: z.string().optional(),
  scope: z.string().optional(),
});

const listEstimatesSchema = z.object({
  status: z.nativeEnum(EstimateStatus).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

const pricingFactorsSchema = z.object({
  estimateId: z.string().cuid(),
  overheadPercent: z.number().min(0).max(100).optional(),
  contingencyPercent: z.number().min(0).max(100).optional(),
  markupPercent: z.number().min(0).max(100).optional(),
});

// ─── Router ────────────────────────────────────────────────────────────────────

export const estimateRouter = router({
  /**
   * Create a new estimate.
   */
  create: authedProcedure.input(createEstimateSchema).mutation(async ({ input, ctx }) => {
    try {
      return await estimateService.createEstimate(ctx.user!.orgId, ctx.user!.id, input);
    } catch (err) {
      mapError(err);
    }
  }),

  /**
   * Get an estimate by ID.
   */
  get: authedProcedure
    .input(z.object({ estimateId: z.string().cuid() }))
    .query(async ({ input, ctx }) => {
      try {
        return await estimateService.getEstimate(ctx.user!.orgId, input.estimateId);
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * List estimates for the current org.
   */
  list: authedProcedure.input(listEstimatesSchema).query(async ({ input, ctx }) => {
    try {
      return await estimateService.listEstimates(ctx.user!.orgId, input);
    } catch (err) {
      mapError(err);
    }
  }),

  /**
   * Update an estimate.
   */
  update: authedProcedure
    .input(z.object({ estimateId: z.string().cuid() }).merge(updateEstimateSchema))
    .mutation(async ({ input, ctx }) => {
      const { estimateId, ...rest } = input;
      try {
        return await estimateService.updateEstimate(
          ctx.user!.orgId,
          estimateId,
          ctx.user!.id,
          rest,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Transition estimate status.
   */
  transition: authedProcedure
    .input(
      z.object({
        estimateId: z.string().cuid(),
        status: z.nativeEnum(EstimateStatus),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await estimateService.transitionStatus(
          ctx.user!.orgId,
          input.estimateId,
          input.status,
          ctx.user!.id,
          input.reason,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Create a manual version snapshot.
   */
  createVersion: authedProcedure
    .input(z.object({ estimateId: z.string().cuid(), changeNote: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await estimateService.createVersion(
          ctx.user!.orgId,
          input.estimateId,
          ctx.user!.id,
          input.changeNote,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * List version history for an estimate.
   */
  listVersions: authedProcedure
    .input(z.object({ estimateId: z.string().cuid() }))
    .query(async ({ input, ctx }) => {
      try {
        return await estimateService.listVersions(ctx.user!.orgId, input.estimateId);
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Get a specific version.
   */
  getVersion: authedProcedure
    .input(
      z.object({
        estimateId: z.string().cuid(),
        version: z.number().int().positive(),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        return await estimateService.getVersion(
          ctx.user!.orgId,
          input.estimateId,
          input.version,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Update overhead / contingency / markup percent factors.
   */
  updatePricingFactors: authedProcedure
    .input(pricingFactorsSchema)
    .mutation(async ({ input, ctx }) => {
      const { estimateId, ...rest } = input;
      try {
        return await estimateService.updatePricingFactors(
          ctx.user!.orgId,
          estimateId,
          ctx.user!.id,
          rest,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Get cost breakdown for an estimate.
   */
  getCostBreakdown: authedProcedure
    .input(z.object({ estimateId: z.string().cuid() }))
    .query(async ({ input, ctx }) => {
      try {
        return await estimateService.getCostBreakdown(ctx.user!.orgId, input.estimateId);
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Get full summary for an estimate.
   */
  getSummary: authedProcedure
    .input(z.object({ estimateId: z.string().cuid() }))
    .query(async ({ input, ctx }) => {
      try {
        return await estimateService.getSummary(ctx.user!.orgId, input.estimateId);
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Compare two versions of the same estimate.
   */
  compareVersions: authedProcedure
    .input(
      z.object({
        estimateId: z.string().cuid(),
        versionA: z.number().int(),
        versionB: z.number().int(),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        return await estimateService.compareVersions(
          ctx.user!.orgId,
          input.estimateId,
          input.versionA,
          input.versionB,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Compare two separate estimates.
   */
  compareEstimates: authedProcedure
    .input(
      z.object({
        estimateIdA: z.string().cuid(),
        estimateIdB: z.string().cuid(),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        return await estimateService.compareEstimates(
          ctx.user!.orgId,
          input.estimateIdA,
          input.estimateIdB,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Convert an approved estimate to a project.
   */
  convertToProject: authedProcedure
    .input(
      z.object({
        estimateId: z.string().cuid(),
        projectName: z.string().optional(),
        projectType: z.string().optional(),
        plannedStartDate: z.coerce.date().optional(),
        plannedEndDate: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { estimateId, ...rest } = input;
      try {
        return await estimateService.convertToProject(
          ctx.user!.orgId,
          estimateId,
          ctx.user!.id,
          rest,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Get audit history for an estimate.
   */
  auditHistory: authedProcedure
    .input(
      z.object({
        estimateId: z.string().cuid(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        await estimateService.getEstimate(ctx.user!.orgId, input.estimateId);
        return auditRepository.findByEntity("estimate", input.estimateId);
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * List all standard measurement units.
   */
  listUnits: authedProcedure.query(() => {
    return getAllUnits();
  }),
});
