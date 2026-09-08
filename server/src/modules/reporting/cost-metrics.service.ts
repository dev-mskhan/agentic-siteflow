import { db } from "../../infrastructure/database/client.js";
import { cacheGet, cacheSet, cacheDel, cacheKey, CACHE_TTL } from "../../infrastructure/redis/cache.js";
import { NotFoundError } from "../../common/index.js";
import { financialVarianceService } from "../commercial/financial-variance.service.js";
import type { CostMetrics } from "./cost-metrics.types.js";

export class CostMetricsService {
  async getCostMetrics(orgId: string, projectId: string): Promise<CostMetrics> {
    const cached = await cacheGet<CostMetrics>(cacheKey.costMetrics(projectId));
    if (cached) return cached;

    // Project check + contractValue
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        orgId: true,
        currency: true,
        contractValue: true,
      },
    });
    if (!project || project.orgId !== orgId) {
      throw new NotFoundError("Project not found");
    }

    const now = new Date();

    // Reuse the existing (potentially cached) financial overview for budget block
    const overview = await financialVarianceService.getProjectCommercialOverview(
      orgId,
      projectId,
    );

    // Parallel: change orders, payment applications (approved), payments (AR)
    const [changeOrders, approvedPayApps, arPayments] = await Promise.all([
      db.changeOrder.findMany({
        where: { projectId, orgId },
        select: { status: true, costDelta: true },
      }),
      db.paymentApplication.findMany({
        where: {
          projectId,
          orgId,
          type: "CLIENT",
          status: "APPROVED",
        },
        select: { currentPaymentDue: true, retainageAmount: true },
      }),
      db.payment.findMany({
        where: {
          invoice: {
            projectId,
            orgId,
            type: "ACCOUNTS_RECEIVABLE",
          },
          status: "COMPLETED",
        },
        select: { amount: true },
      }),
    ]);

    // ── Change orders ─────────────────────────────────────────────────────────
    const approvedCOs = changeOrders.filter((co) => co.status === "APPROVED");
    const pendingCOs = changeOrders.filter(
      (co) => co.status === "SUBMITTED" || co.status === "UNDER_REVIEW",
    );
    const totalApprovedValue = approvedCOs.reduce(
      (sum, co) => sum + Number(co.costDelta),
      0,
    );
    const totalPendingValue = pendingCOs.reduce(
      (sum, co) => sum + Number(co.costDelta),
      0,
    );

    // ── Billing ───────────────────────────────────────────────────────────────
    const contractValue = Number(project.contractValue ?? 0);
    const totalBilled = approvedPayApps.reduce(
      (sum, app) => sum + Number(app.currentPaymentDue),
      0,
    );
    const totalPaid = arPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const retainageWithheld = approvedPayApps.reduce(
      (sum, app) => sum + Number(app.retainageAmount),
      0,
    );
    const billingPercent =
      contractValue > 0
        ? Math.round((totalBilled / contractValue) * 10000) / 100
        : 0;
    const outstandingReceivables = Math.max(0, totalBilled - totalPaid);

    // ── Over-budget cost codes ────────────────────────────────────────────────
    const overBudgetCostCodes = overview.costCodeBreakdown
      .filter((cc) => cc.isOverBudget)
      .map((cc) => ({
        costCode: cc.costCode,
        name: cc.name,
        revisedBudget: cc.revisedBudget,
        forecastCost: cc.forecastCost,
        variance: cc.variance,
      }));

    const metrics: CostMetrics = {
      projectId,
      currency: project.currency ?? "USD",
      computedAt: now.toISOString(),
      budget: {
        original: overview.totalOriginalBudget,
        approvedChanges: overview.totalApprovedChanges,
        revised: overview.totalRevisedBudget,
        committed: overview.totalCommittedCost,
        actual: overview.totalActualCost,
        forecast: overview.totalForecastCost,
        variance: overview.totalVariance,
        isOverBudget: overview.isOverBudget,
        burnRate: overview.burnRate,
      },
      changeOrders: {
        total: changeOrders.length,
        approved: approvedCOs.length,
        pending: pendingCOs.length,
        totalApprovedValue,
        totalPendingValue,
      },
      billing: {
        contractValue,
        totalBilled,
        totalPaid,
        retainageWithheld,
        billingPercent,
        outstandingReceivables,
      },
      overBudgetCostCodes,
    };

    await cacheSet(cacheKey.costMetrics(projectId), metrics, CACHE_TTL.REPORT_ORG);
    return metrics;
  }

  async invalidate(projectId: string, orgId: string): Promise<void> {
    await cacheDel(
      cacheKey.costMetrics(projectId),
      cacheKey.projectFullReport(projectId),
      cacheKey.orgDashboard(orgId),
    );
  }
}

export const costMetricsService = new CostMetricsService();
