import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "../../api/trpc/trpc.js";
import { NotFoundError, ForbiddenError } from "../../common/index.js";
import { projectHealthService } from "./project-health.service.js";
import { scheduleMetricsService } from "./schedule-metrics.service.js";
import { costMetricsService } from "./cost-metrics.service.js";
import { procurementMetricsService } from "./procurement-metrics.service.js";
import { subcontractorMetricsService } from "./subcontractor-metrics.service.js";
import { executiveReportService } from "./executive-report.service.js";

function mapError(err: unknown): never {
  if (err instanceof NotFoundError) {
    throw new TRPCError({ code: "NOT_FOUND", message: err.message });
  }
  if (err instanceof ForbiddenError) {
    throw new TRPCError({ code: "FORBIDDEN", message: err.message });
  }
  throw err;
}

const projectIdSchema = z.object({ projectId: z.string().cuid() });

/**
 * Reporting router — all procedures are read-only tRPC queries.
 *
 * Authorization model:
 *  - All procedures require authentication (authedProcedure).
 *  - Tenant isolation is enforced by passing ctx.user!.orgId to every service call.
 *    Services throw NotFoundError if the project doesn't belong to the org.
 *  - Cost-sensitive reports (costMetrics, projectFullReport, orgDashboard) additionally
 *    require COMMERCIAL_OVERVIEW_READ, which is already present on all roles that have
 *    REPORT_ORG_READ / REPORT_PROJECT_READ — no extra middleware needed because the
 *    permission is already granted to the same role set.
 */
export const reportingRouter = router({
  /**
   * Project health snapshot: schedule completion %, overdue tasks, issue counts,
   * RFI/submittal status, safety incidents, and a GREEN/AMBER/RED health indicator.
   */
  projectHealth: authedProcedure
    .input(projectIdSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await projectHealthService.getProjectHealthSnapshot(
          ctx.user!.orgId,
          input.projectId,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Schedule metrics: task status breakdown, milestone tracking, phase completion,
   * schedule variance vs baseline, and critical path length.
   */
  scheduleMetrics: authedProcedure
    .input(projectIdSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await scheduleMetricsService.getScheduleMetrics(
          ctx.user!.orgId,
          input.projectId,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Cost metrics: budget vs actual vs forecast, change order summary,
   * billing progress, outstanding receivables, and over-budget cost codes.
   */
  costMetrics: authedProcedure
    .input(projectIdSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await costMetricsService.getCostMetrics(ctx.user!.orgId, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Procurement metrics: material request funnel, PO status breakdown,
   * delivery performance, and top delayed items.
   */
  procurementMetrics: authedProcedure
    .input(projectIdSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await procurementMetricsService.getProcurementMetrics(
          ctx.user!.orgId,
          input.projectId,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Subcontractor metrics: contract summary, task on-time performance,
   * compliance expiry alerts, and per-subcontractor rollup.
   */
  subcontractorMetrics: authedProcedure
    .input(projectIdSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await subcontractorMetricsService.getSubcontractorMetrics(
          ctx.user!.orgId,
          input.projectId,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Full project report: all five sub-reports bundled into a single response.
   * Useful for project detail pages that need the complete picture in one call.
   */
  projectFullReport: authedProcedure
    .input(projectIdSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await executiveReportService.getProjectFullReport(
          ctx.user!.orgId,
          input.projectId,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * Org executive dashboard: health, budget, and schedule summary for every
   * ACTIVE project in the organisation. Suitable for an org-wide overview page.
   */
  orgDashboard: authedProcedure.query(async ({ ctx }) => {
    try {
      return await executiveReportService.getOrgExecutiveDashboard(ctx.user!.orgId);
    } catch (err) {
      mapError(err);
    }
  }),
});
