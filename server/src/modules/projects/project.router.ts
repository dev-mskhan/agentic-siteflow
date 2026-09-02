import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { projectRepository } from "./project.repository.js";
import { projectMemberRepository } from "./project-member.repository.js";
import { projectSettingsRepository } from "./project-settings.repository.js";
import { projectPhaseRepository } from "./project-phase.repository.js";
import { ProjectService } from "./project.service.js";
import { auditService } from "../audit/audit.router.js";
import { auditRepository } from "../audit/audit.repository.js";
import { ConflictError, NotFoundError, ValidationError } from "../../common/index.js";

export const projectService = new ProjectService(
  projectRepository,
  auditService,
  projectMemberRepository,
  projectSettingsRepository,
  projectPhaseRepository,
);

/**
 * Maps domain errors to tRPC errors.
 */
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
  throw err;
}

// ─── Input Schemas ────────────────────────────────────────────────────────────

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  projectType: z.string().optional(),
  currency: z.string().length(3).optional(),
  clientName: z.string().optional(),
  clientContact: z.string().optional(),
  siteAddress: z.string().optional(),
  siteCity: z.string().optional(),
  siteCountry: z.string().optional(),
  contractValue: z.number().positive().optional(),
  plannedStartDate: z.coerce.date().optional(),
  plannedEndDate: z.coerce.date().optional(),
  budget: z.number().positive().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  projectType: z.string().optional(),
  currency: z.string().length(3).optional(),
  clientName: z.string().optional(),
  clientContact: z.string().optional(),
  siteAddress: z.string().optional(),
  siteCity: z.string().optional(),
  siteCountry: z.string().optional(),
  contractValue: z.number().positive().optional(),
  plannedStartDate: z.coerce.date().optional(),
  plannedEndDate: z.coerce.date().optional(),
  budget: z.number().positive().optional(),
});

const listProjectsSchema = z.object({
  status: z
    .enum(["DRAFT", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"])
    .optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

const projectMemberSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum([
    "PROJECT_MANAGER",
    "FINANCE",
    "PROCUREMENT",
    "SITE_SUPERVISOR",
    "SUBCONTRACTOR",
    "CLIENT",
    "VIEWER",
  ]),
});

const updateSettingsSchema = z.object({
  currency: z.string().optional(),
  currencySymbol: z.string().optional(),
  timezone: z.string().optional(),
  dateFormat: z.string().optional(),
  unitSystem: z.string().optional(),
  country: z.string().optional(),
  taxRate: z.number().min(0).max(1).optional(),
  taxLabel: z.string().optional(),
  retainagePercent: z.number().min(0).max(1).optional(),
  paymentTermsDays: z.number().int().positive().optional(),
  requireChangeOrderApproval: z.boolean().optional(),
  requirePaymentApproval: z.boolean().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

const createPhaseSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  color: z.string().optional(),
  plannedStartDate: z.coerce.date().optional(),
  plannedEndDate: z.coerce.date().optional(),
});

const updatePhaseSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  plannedStartDate: z.coerce.date().optional(),
  plannedEndDate: z.coerce.date().optional(),
  actualStartDate: z.coerce.date().optional(),
  actualEndDate: z.coerce.date().optional(),
  status: z.string().optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const projectRouter = router({
  /**
   * Create a new project.
   */
  create: authedProcedure.input(createProjectSchema).mutation(async ({ input, ctx }) => {
    try {
      const orgId = ctx.user!.orgId;
      const userId = ctx.user!.id;
      return await projectService.createProject(orgId, userId, input);
    } catch (err) {
      mapError(err);
    }
  }),

  /**
   * Get a project by ID.
   */
  get: authedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      try {
        return await projectService.getProject(ctx.user!.orgId, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * List projects for the current org.
   */
  list: authedProcedure.input(listProjectsSchema).query(async ({ input, ctx }) => {
    try {
      return await projectService.listProjects(ctx.user!.orgId, input);
    } catch (err) {
      mapError(err);
    }
  }),

  /**
   * Update a project.
   */
  update: authedProcedure
    .input(z.object({ projectId: z.string().min(1) }).merge(updateProjectSchema))
    .mutation(async ({ input, ctx }) => {
      const { projectId, ...rest } = input;
      try {
        return await projectService.updateProject(ctx.user!.orgId, projectId, ctx.user!.id, rest);
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Transition project status.
   */
  transition: authedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        status: z.enum(["DRAFT", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await projectService.transitionStatus(
          ctx.user!.orgId,
          input.projectId,
          input.status,
          ctx.user!.id,
          input.reason,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Add a member to a project.
   */
  addMember: authedProcedure.input(projectMemberSchema).mutation(async ({ input, ctx }) => {
    try {
      return await projectService.addMember(ctx.user!.orgId, input.projectId, {
        userId: input.userId,
        role: input.role,
        addedById: ctx.user!.id,
      });
    } catch (err) {
      mapError(err);
    }
  }),

  /**
   * Remove a member from a project.
   */
  removeMember: authedProcedure
    .input(z.object({ projectId: z.string().min(1), userId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        await projectService.removeMember(ctx.user!.orgId, input.projectId, input.userId);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * List project members.
   */
  listMembers: authedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      try {
        return await projectService.listProjectMembers(ctx.user!.orgId, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Update a project member's role.
   */
  updateMemberRole: authedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        userId: z.string().min(1),
        role: z.enum([
          "PROJECT_MANAGER",
          "FINANCE",
          "PROCUREMENT",
          "SITE_SUPERVISOR",
          "SUBCONTRACTOR",
          "CLIENT",
          "VIEWER",
        ]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await projectService.updateMemberRole(
          ctx.user!.orgId,
          input.projectId,
          input.userId,
          input.role,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Get project settings.
   */
  getSettings: authedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      try {
        return await projectService.getProjectSettings(ctx.user!.orgId, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Update project settings.
   */
  updateSettings: authedProcedure
    .input(z.object({ projectId: z.string().min(1) }).merge(updateSettingsSchema))
    .mutation(async ({ input, ctx }) => {
      const { projectId, ...rest } = input;
      try {
        return await projectService.updateProjectSettings(
          ctx.user!.orgId,
          projectId,
          ctx.user!.id,
          rest,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Create a project phase.
   */
  createPhase: authedProcedure.input(createPhaseSchema).mutation(async ({ input, ctx }) => {
    const { projectId, ...rest } = input;
    try {
      return await projectService.createPhase(ctx.user!.orgId, projectId, ctx.user!.id, rest);
    } catch (err) {
      mapError(err);
    }
  }),

  /**
   * List phases for a project.
   */
  listPhases: authedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      try {
        return await projectService.listPhases(ctx.user!.orgId, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Update a project phase.
   */
  updatePhase: authedProcedure
    .input(z.object({ projectId: z.string().min(1), phaseId: z.string().min(1) }).merge(updatePhaseSchema))
    .mutation(async ({ input, ctx }) => {
      const { projectId, phaseId, ...rest } = input;
      try {
        return await projectService.updatePhase(
          ctx.user!.orgId,
          projectId,
          phaseId,
          ctx.user!.id,
          rest,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Delete a project phase.
   */
  deletePhase: authedProcedure
    .input(z.object({ projectId: z.string().min(1), phaseId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        await projectService.deletePhase(ctx.user!.orgId, input.projectId, input.phaseId, ctx.user!.id);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Reorder phases.
   */
  reorderPhases: authedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        orderedIds: z.array(z.string().min(1)),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        await projectService.reorderPhases(
          ctx.user!.orgId,
          input.projectId,
          input.orderedIds,
          ctx.user!.id,
        );
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Get project audit history.
   */
  auditHistory: authedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      try {
        // Verifies access + tenant scope first
        await projectService.getProject(ctx.user!.orgId, input.projectId);
        return auditRepository.findByEntity("project", input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),
});
