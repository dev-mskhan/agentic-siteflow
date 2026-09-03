import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { committedCostService } from "./committed-cost.service.js";
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

export const committedCostRouter = router({
  /**
   * 5.8.3 — Get committed costs for a project
   */
  getProjectCommittedCost: authedProcedure
    .input(z.object({ projectId: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await committedCostService.getProjectCommittedCost(
          ctx.user!.orgId,
          input.projectId,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * 5.8.3 — Get committed cost overview across all projects in the organization
   */
  getOrgCommittedCost: authedProcedure.query(async ({ ctx }) => {
    try {
      return await committedCostService.getOrgCommittedCostOverview(ctx.user!.orgId);
    } catch (err) {
      mapError(err);
    }
  }),
});
