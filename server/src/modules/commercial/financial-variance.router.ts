import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { financialVarianceService } from "./financial-variance.service.js";
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

export const financialVarianceRouter = router({
  getProjectFinancialOverview: authedProcedure
    .input(z.object({ projectId: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await financialVarianceService.getProjectCommercialOverview(
          ctx.user!.orgId,
          input.projectId,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  getOrgFinancialOverview: authedProcedure.query(async ({ ctx }) => {
    try {
      return await financialVarianceService.getOrgCommercialOverview(ctx.user!.orgId);
    } catch (err) {
      mapError(err);
    }
  }),
});
