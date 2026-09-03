import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authedProcedure, router } from "../../api/trpc/trpc.js";
import { ConflictError, NotFoundError, ValidationError } from "../../common/index.js";
import { dailyLogService } from "./daily-log.service.js";

function mapError(err: unknown): never {
  if (err instanceof NotFoundError) throw new TRPCError({ code: "NOT_FOUND", message: err.message });
  if (err instanceof ConflictError) throw new TRPCError({ code: "CONFLICT", message: err.message });
  if (err instanceof ValidationError) throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  throw err;
}

const id = z.string().cuid();
const quantity = z.object({ description: z.string().min(1), quantity: z.number().nonnegative(), unit: z.string().min(1) });
const delivery = z.object({ item: z.string().min(1), supplier: z.string().optional(), quantity: z.number().nonnegative() });
const delay = z.object({ description: z.string().min(1), hoursLost: z.number().nonnegative(), reason: z.string().optional() });
const safetyEvent = z.object({ description: z.string().min(1), severity: z.string().min(1) });
const fields = {
  weather: z.string().max(100).optional(),
  temperature: z.number().int().optional(),
  siteConditions: z.string().optional(),
  workerCount: z.number().int().nonnegative().optional(),
  subcontractorCount: z.number().int().nonnegative().optional(),
  equipmentNotes: z.string().optional(),
  workPerformed: z.string().min(1),
  quantitiesCompleted: z.array(quantity).optional(),
  deliveries: z.array(delivery).optional(),
  delays: z.array(delay).optional(),
  safetyEvents: z.array(safetyEvent).optional(),
  notes: z.string().optional(),
};

export const dailyLogRouter = router({
  create: authedProcedure.input(z.object({ projectId: id, logDate: z.coerce.date(), ...fields })).mutation(async ({ input, ctx }) => {
    try {
      const { projectId, ...data } = input;
      return await dailyLogService.createLog(ctx.user!.orgId, projectId, ctx.user!.id, data);
    } catch (err) { mapError(err); }
  }),
  update: authedProcedure.input(z.object({ logId: id, logDate: z.coerce.date().optional(), ...Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, (schema as z.ZodType).optional()])) })).mutation(async ({ input, ctx }) => {
    try {
      const { logId, ...data } = input;
      return await dailyLogService.updateLog(ctx.user!.orgId, logId, ctx.user!.id, data);
    } catch (err) { mapError(err); }
  }),
  list: authedProcedure.input(z.object({ projectId: id, from: z.coerce.date().optional(), to: z.coerce.date().optional(), limit: z.number().int().min(1).max(100).default(50), offset: z.number().int().min(0).default(0) })).query(async ({ input, ctx }) => {
    try {
      const { projectId, ...filters } = input;
      return await dailyLogService.listLogs(ctx.user!.orgId, projectId, filters);
    } catch (err) { mapError(err); }
  }),
  get: authedProcedure.input(z.object({ projectId: id, logDate: z.coerce.date() })).query(async ({ input, ctx }) => {
    try { return await dailyLogService.getLog(ctx.user!.orgId, input.projectId, input.logDate); }
    catch (err) { mapError(err); }
  }),
});
