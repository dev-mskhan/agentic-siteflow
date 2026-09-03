import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { TaskPriority, TaskStatus } from "@prisma/client";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { taskService } from "./task.service.js";
import { taskHistoryRepository } from "./task-history.repository.js";
import { taskDateChangeRepository } from "./task-date-change.repository.js";
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

const taskIdSchema = z.string().cuid();
const projectIdSchema = z.string().cuid();
const optionalTaskDate = z.coerce.date().optional();

const createTaskSchema = z.object({
  projectId: projectIdSchema,
  phaseId: z.string().cuid().optional(),
  costCodeId: z.string().cuid().optional(),
  assigneeId: z.string().cuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  plannedStartDate: optionalTaskDate,
  plannedEndDate: optionalTaskDate,
  actualStartDate: optionalTaskDate,
  actualEndDate: optionalTaskDate,
  durationDays: z.number().int().positive().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  notes: z.string().optional(),
});

const updateTaskSchema = z.object({
  taskId: taskIdSchema,
  phaseId: z.string().cuid().nullable().optional(),
  costCodeId: z.string().cuid().nullable().optional(),
  assigneeId: z.string().cuid().nullable().optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  plannedStartDate: z.coerce.date().nullable().optional(),
  plannedEndDate: z.coerce.date().nullable().optional(),
  actualStartDate: z.coerce.date().nullable().optional(),
  actualEndDate: z.coerce.date().nullable().optional(),
  durationDays: z.number().int().positive().nullable().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  notes: z.string().nullable().optional(),
});

const listTaskSchema = z.object({
  projectId: projectIdSchema,
  status: z.nativeEnum(TaskStatus).optional(),
  phaseId: z.string().cuid().optional(),
  assigneeId: z.string().cuid().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});
const dependencyTypeSchema = z.enum(["FS", "SS", "FF", "SF"]);
const dependencyIdsSchema = z.object({
  projectId: projectIdSchema,
  predecessorId: taskIdSchema,
  successorId: taskIdSchema,
});

export const taskRouter = router({
  create: authedProcedure.input(createTaskSchema).mutation(async ({ input, ctx }) => {
    const { projectId, ...taskInput } = input;
    try {
      return await taskService.createTask(ctx.user!.orgId, projectId, ctx.user!.id, taskInput);
    } catch (err) {
      mapError(err);
    }
  }),

  get: authedProcedure.input(z.object({ taskId: taskIdSchema })).query(async ({ input, ctx }) => {
    try {
      return await taskService.getTask(ctx.user!.orgId, input.taskId);
    } catch (err) {
      mapError(err);
    }
  }),

  list: authedProcedure.input(listTaskSchema).query(async ({ input, ctx }) => {
    const { projectId, ...filters } = input;
    try {
      return await taskService.listTasks(ctx.user!.orgId, projectId, filters);
    } catch (err) {
      mapError(err);
    }
  }),

  update: authedProcedure.input(updateTaskSchema).mutation(async ({ input, ctx }) => {
    const { taskId, ...taskInput } = input;
    try {
      return await taskService.updateTask(ctx.user!.orgId, taskId, ctx.user!.id, taskInput);
    } catch (err) {
      mapError(err);
    }
  }),

  updateDates: authedProcedure
    .input(
      z.object({
        taskId: taskIdSchema,
        plannedStartDate: z.coerce.date().nullable().optional(),
        plannedEndDate: z.coerce.date().nullable().optional(),
        durationDays: z.number().int().positive().nullable().optional(),
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { taskId, ...dateInput } = input;
      try {
        return await taskService.updateTaskDates(
          ctx.user!.orgId,
          taskId,
          ctx.user!.id,
          dateInput,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  transition: authedProcedure
    .input(
      z.object({
        taskId: taskIdSchema,
        status: z.nativeEnum(TaskStatus),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await taskService.transitionStatus(
          ctx.user!.orgId,
          input.taskId,
          input.status,
          ctx.user!.id,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  updateProgress: authedProcedure
    .input(
      z.object({
        taskId: taskIdSchema,
        progress: z.number().int().min(0).max(100),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await taskService.updateProgress(
          ctx.user!.orgId,
          input.taskId,
          ctx.user!.id,
          input.progress,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  getHistory: authedProcedure
    .input(z.object({ taskId: taskIdSchema }))
    .query(async ({ input, ctx }) => {
      try {
        await taskService.getTask(ctx.user!.orgId, input.taskId);
        return await taskHistoryRepository.findByTask(ctx.user!.orgId, input.taskId);
      } catch (err) {
        mapError(err);
      }
    }),

    getDateHistory: authedProcedure
      .input(z.object({ taskId: taskIdSchema }))
      .query(async ({ input, ctx }) => {
        try {
          await taskService.getTask(ctx.user!.orgId, input.taskId);
          return await taskDateChangeRepository.findByTask(ctx.user!.orgId, input.taskId);
        } catch (err) {
          mapError(err);
        }
      }),

  auditHistory: authedProcedure
    .input(
      z.object({
        taskId: taskIdSchema,
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        await taskService.getTask(ctx.user!.orgId, input.taskId);
        return auditRepository.findByEntity(
          "task",
          input.taskId,
          input.limit,
          input.offset,
          ctx.user!.orgId,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  addDependency: authedProcedure
    .input(
      dependencyIdsSchema.extend({
        type: dependencyTypeSchema.optional(),
        lagDays: z.number().int().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await taskService.addDependency(
          ctx.user!.orgId,
          input.projectId,
          input.predecessorId,
          input.successorId,
          ctx.user!.id,
          input.type,
          input.lagDays,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  removeDependency: authedProcedure
    .input(dependencyIdsSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await taskService.removeDependency(
          ctx.user!.orgId,
          input.projectId,
          input.predecessorId,
          input.successorId,
          ctx.user!.id,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  listDependencies: authedProcedure
    .input(z.object({ taskId: taskIdSchema }))
    .query(async ({ input, ctx }) => {
      try {
        return await taskService.listDependencies(ctx.user!.orgId, input.taskId);
      } catch (err) {
        mapError(err);
      }
    }),
});
