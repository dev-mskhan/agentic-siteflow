import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { IssuePriority, IssueStatus } from "@prisma/client";
import { authedProcedure, router } from "../../api/trpc/trpc.js";
import { ConflictError, NotFoundError, ValidationError } from "../../common/index.js";
import { issueService } from "./issue.service.js";
import { auditRepository } from "../audit/audit.repository.js";

function mapError(err: unknown): never {
  if (err instanceof NotFoundError) throw new TRPCError({ code: "NOT_FOUND", message: err.message });
  if (err instanceof ConflictError) throw new TRPCError({ code: "CONFLICT", message: err.message });
  if (err instanceof ValidationError) throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  throw err;
}

const id = z.string().cuid();
const issueFields = {
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(10000),
  category: z.string().max(100).nullable().optional(),
  priority: z.nativeEnum(IssuePriority).optional(),
  status: z.nativeEnum(IssueStatus).optional(),
  responsiblePartyId: id.nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  hasProjectImpact: z.boolean().optional(),
  projectImpactDescription: z.string().nullable().optional(),
  hasCostImpact: z.boolean().optional(),
  costImpactAmount: z.number().nonnegative().nullable().optional(),
  hasScheduleImpact: z.boolean().optional(),
  scheduleImpactDays: z.number().int().nonnegative().nullable().optional(),
  linkedTaskId: id.nullable().optional(),
};

export const issueRouter = router({
  create: authedProcedure.input(z.object({ projectId: id, ...issueFields })).mutation(async ({ input, ctx }) => {
    try {
      const { projectId, ...data } = input;
      return await issueService.createIssue(ctx.user!.orgId, projectId, ctx.user!.id, data);
    } catch (err) { mapError(err); }
  }),
  update: authedProcedure.input(z.object({ issueId: id, ...Object.fromEntries(Object.entries(issueFields).map(([key, schema]) => [key, (schema as z.ZodType).optional()])) })).mutation(async ({ input, ctx }) => {
    try {
      const { issueId, ...data } = input;
      return await issueService.updateIssue(ctx.user!.orgId, issueId, ctx.user!.id, data);
    } catch (err) { mapError(err); }
  }),
  resolve: authedProcedure.input(z.object({ issueId: id, resolution: z.string().min(1).max(10000) })).mutation(async ({ input, ctx }) => {
    try { return await issueService.resolveIssue(ctx.user!.orgId, input.issueId, ctx.user!.id, input.resolution); }
    catch (err) { mapError(err); }
  }),
  list: authedProcedure.input(z.object({ projectId: id, status: z.nativeEnum(IssueStatus).optional(), priority: z.nativeEnum(IssuePriority).optional(), category: z.string().optional(), limit: z.number().int().min(1).max(100).default(50), offset: z.number().int().min(0).default(0) })).query(async ({ input, ctx }) => {
    try {
      const { projectId, ...filters } = input;
      return await issueService.listIssues(ctx.user!.orgId, projectId, filters);
    } catch (err) { mapError(err); }
  }),
  get: authedProcedure.input(z.object({ issueId: id })).query(async ({ input, ctx }) => {
    try { return await issueService.getIssue(ctx.user!.orgId, input.issueId); }
    catch (err) { mapError(err); }
  }),
  auditHistory: authedProcedure
    .input(
    z.object({
      issueId: id,
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }),
    )
    .query(async ({ input, ctx }) => {
    try {
      await issueService.getIssue(ctx.user!.orgId, input.issueId);
      return auditRepository.findByEntity(
        "issue",
        input.issueId,
        input.limit,
        input.offset,
        ctx.user!.orgId,
      );
    } catch (err) {
      mapError(err);
    }
    }),
});
