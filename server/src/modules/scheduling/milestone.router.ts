import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authedProcedure, router } from "../../api/trpc/trpc.js";
import { ConflictError, NotFoundError, ValidationError } from "../../common/index.js";
import { milestoneService } from "./milestone.service.js";

function mapError(err: unknown): never {
  if (err instanceof NotFoundError) throw new TRPCError({ code: "NOT_FOUND", message: err.message });
  if (err instanceof ConflictError) throw new TRPCError({ code: "CONFLICT", message: err.message });
  if (err instanceof ValidationError) throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  throw err;
}

const id = z.string().cuid();
const createSchema = z.object({
  projectId: id,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  dueDate: z.coerce.date(),
  linkedTaskId: id.nullable().optional(),
});
const updateSchema = z.object({
  milestoneId: id,
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  dueDate: z.coerce.date().optional(),
  status: z.enum(["PENDING", "ACHIEVED", "MISSED"]).optional(),
  linkedTaskId: id.nullable().optional(),
});

export const milestoneRouter = router({
  create: authedProcedure.input(createSchema).mutation(async ({ input, ctx }) => {
    try {
      const { projectId, ...data } = input;
      return await milestoneService.createMilestone(ctx.user!.orgId, projectId, ctx.user!.id, data);
    } catch (err) { mapError(err); }
  }),
  list: authedProcedure.input(z.object({ projectId: id })).query(async ({ input, ctx }) => {
    try { return await milestoneService.listMilestones(ctx.user!.orgId, input.projectId); }
    catch (err) { mapError(err); }
  }),
  update: authedProcedure.input(updateSchema).mutation(async ({ input, ctx }) => {
    try {
      const { milestoneId, ...data } = input;
      return await milestoneService.updateMilestone(ctx.user!.orgId, milestoneId, ctx.user!.id, data);
    } catch (err) { mapError(err); }
  }),
  markAchieved: authedProcedure.input(z.object({ milestoneId: id })).mutation(async ({ input, ctx }) => {
    try { return await milestoneService.markAchieved(ctx.user!.orgId, input.milestoneId, ctx.user!.id); }
    catch (err) { mapError(err); }
  }),
  checkMissed: authedProcedure.input(z.object({ projectId: id })).query(async ({ input, ctx }) => {
    try { return await milestoneService.checkMissedMilestones(ctx.user!.orgId, input.projectId); }
    catch (err) { mapError(err); }
  }),
  delete: authedProcedure.input(z.object({ milestoneId: id })).mutation(async ({ input, ctx }) => {
    try { return await milestoneService.deleteMilestone(ctx.user!.orgId, input.milestoneId, ctx.user!.id); }
    catch (err) { mapError(err); }
  }),
});
