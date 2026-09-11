import { z } from "zod";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { getJobStatus } from "../../infrastructure/queue/status.js";
import { listDeadLetters, retryDeadLetter } from "../../infrastructure/queue/deadLetter.js";
import { TRPCError } from "@trpc/server";

export const queueRouter = router({
  status: authedProcedure
    .input(z.object({ queue: z.string().min(1), jobId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const status = await getJobStatus(input.queue, input.jobId);
      if (!status) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      if ("orgId" in status && status.orgId && status.orgId !== ctx.user.orgId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Job belongs to another organization" });
      }
      return status;
    }),
  deadLetters: authedProcedure
    .input(z.object({ queue: z.string().min(1), limit: z.number().int().min(1).max(100).default(50) }))
    .query(({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      if (ctx.user.role !== "ADMIN") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      return listDeadLetters(input.queue, input.limit);
    }),
  retryDeadLetter: authedProcedure
    .input(z.object({ queue: z.string().min(1), jobId: z.string().min(1) }))
    .mutation(({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      if (ctx.user.role !== "ADMIN") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      return retryDeadLetter(input.queue, input.jobId);
    }),
});
