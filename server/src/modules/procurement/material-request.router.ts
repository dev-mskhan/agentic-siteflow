import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { MaterialRequestPriority, MaterialRequestStatus } from "@prisma/client";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { materialRequestService } from "./material-request.service.js";
import { auditRepository } from "../audit/audit.repository.js";
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

const createItemSchema = z.object({
  materialId: z.string().cuid().optional(),
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(20),
  estimatedUnitCost: z.number().nonnegative().optional(),
  costCodeId: z.string().cuid().optional(),
  linkedTaskId: z.string().cuid().optional(),
  linkedBoqItemId: z.string().cuid().optional(),
});

const createRequestSchema = z.object({
  projectId: cuidSchema,
  title: z.string().min(1).max(200),
  priority: z.nativeEnum(MaterialRequestPriority).optional(),
  neededByDate: z.coerce.date(),
  deliveryLocation: z.string().max(300).optional(),
  notes: z.string().max(2000).optional(),
  items: z.array(createItemSchema).min(1),
});

const listRequestsSchema = z.object({
  projectId: cuidSchema,
  status: z.nativeEnum(MaterialRequestStatus).optional(),
  priority: z.nativeEnum(MaterialRequestPriority).optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const materialRequestRouter = router({
  create: authedProcedure
    .input(createRequestSchema)
    .mutation(async ({ ctx, input }) => {
      const { projectId, ...rest } = input;
      try {
        return await materialRequestService.createRequest(
          ctx.user!.orgId,
          projectId,
          ctx.user!.id,
          rest,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  get: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await materialRequestService.getRequest(ctx.user!.orgId, input.id);
      } catch (err) {
        mapError(err);
      }
    }),

  list: authedProcedure
    .input(listRequestsSchema)
    .query(async ({ ctx, input }) => {
      const { projectId, ...filters } = input;
      try {
        return await materialRequestService.listRequests(
          ctx.user!.orgId,
          projectId,
          filters,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  submit: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await materialRequestService.submitRequest(
          ctx.user!.orgId,
          input.id,
          ctx.user!.id,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  approve: authedProcedure
    .input(z.object({ id: cuidSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await materialRequestService.approveRequest(
          ctx.user!.orgId,
          input.id,
          ctx.user!.id,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  reject: authedProcedure
    .input(z.object({ id: cuidSchema, reason: z.string().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await materialRequestService.rejectRequest(
          ctx.user!.orgId,
          input.id,
          ctx.user!.id,
          input.reason,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  auditHistory: authedProcedure
    .input(
      z.object({
        requestId: cuidSchema,
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        await materialRequestService.getRequest(ctx.user!.orgId, input.requestId);
        return await auditRepository.findByEntity(
          "material_request",
          input.requestId,
          input.limit,
          input.offset,
          ctx.user!.orgId,
        );
      } catch (err) {
        mapError(err);
      }
    }),
});
