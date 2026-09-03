import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authedProcedure, router } from "../../api/trpc/trpc.js";
import { NotFoundError, ValidationError, ConflictError, UnauthorizedError } from "../../common/index.js";
import { scheduleService } from "./schedule.service.js";

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

const projectIdSchema = z.string().cuid();

export const scheduleRouter = router({
  captureBaseline: authedProcedure
    .input(z.object({ projectId: projectIdSchema, name: z.string().min(1).optional() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await scheduleService.captureBaseline(
          ctx.user!.orgId,
          input.projectId,
          ctx.user!.id,
          input.name,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  getBaseline: authedProcedure
    .input(z.object({ projectId: projectIdSchema }))
    .query(async ({ input, ctx }) => {
      try {
        return await scheduleService.getBaseline(ctx.user!.orgId, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  getVariance: authedProcedure
    .input(z.object({ projectId: projectIdSchema }))
    .query(async ({ input, ctx }) => {
      try {
        return await scheduleService.getScheduleVariance(ctx.user!.orgId, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  getImpactedTasks: authedProcedure
    .input(z.object({ projectId: projectIdSchema, taskId: z.string().cuid() }))
    .query(async ({ input, ctx }) => {
      try {
        return await scheduleService.getImpactedTasks(
          ctx.user!.orgId,
          input.projectId,
          input.taskId,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  getCriticalPath: authedProcedure
    .input(z.object({ projectId: projectIdSchema }))
    .query(async ({ input, ctx }) => {
      try {
        return await scheduleService.getCriticalPath(ctx.user!.orgId, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),
});
