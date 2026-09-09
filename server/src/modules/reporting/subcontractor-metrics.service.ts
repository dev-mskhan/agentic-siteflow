import { db } from "../../infrastructure/database/client.js";
import { cacheGet, cacheSet, cacheDel, cacheKey, CACHE_TTL } from "../../infrastructure/redis/cache.js";
import { NotFoundError } from "../../common/index.js";
import type { SubcontractorMetrics, SubcontractorRollup } from "./subcontractor-metrics.types.js";

export class SubcontractorMetricsService {
  async getSubcontractorMetrics(orgId: string, projectId: string): Promise<SubcontractorMetrics> {
    const cached = await cacheGet<SubcontractorMetrics>(
      cacheKey.subcontractorMetrics(projectId),
    );
    if (cached) return cached;

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, orgId: true },
    });
    if (!project || project.orgId !== orgId) {
      throw new NotFoundError("Project not found");
    }

    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [contracts, subcontractors, tasks, arPayments, retainageReleases] = await Promise.all([
      db.subcontractorContract.findMany({
        where: { projectId, orgId },
        take: 500, // G15: cap unbounded query; projects with >500 contracts need DB-level aggregation
        select: {
          id: true,
          status: true,
          contractValue: true,
          subcontractorId: true,
        },
      }),
      db.subcontractor.findMany({
        where: { orgId },
        take: 500, // G15: cap unbounded query; large orgs should use a paginated lookup
        select: {
          id: true,
          companyName: true,
          trade: true,
          isCompliant: true,
          insuranceExpiry: true,
          licenseExpiry: true,
          rating: true,
        },
      }),
      db.task.findMany({
        where: { projectId, orgId, subcontractorId: { not: null } },
        take: 500, // G15: cap unbounded query
        select: {
          id: true,
          status: true,
          subcontractorId: true,
          plannedEndDate: true,
          actualEndDate: true,
        },
      }),
      // AP payments for subcontractors on this project
      db.payment.findMany({
        where: {
          invoice: {
            projectId,
            orgId,
            type: "ACCOUNTS_PAYABLE",
            subcontractorId: { not: null },
          },
          status: "COMPLETED",
        },
        take: 500, // G15: cap unbounded query
        select: { amount: true },
      }),
      db.retainageRelease.findMany({
        where: { projectId, orgId, status: "RELEASED" },
        take: 500, // G15: cap unbounded query
        select: { amountToRelease: true },
      }),
    ]);

    // ── Contract summary ──────────────────────────────────────────────────────
    const activeContracts = contracts.filter((c) => c.status === "ACTIVE");
    const totalContractValue = contracts
      .filter((c) => c.status !== "TERMINATED")
      .reduce((sum, c) => sum + Number(c.contractValue), 0);
    const totalPaid = arPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const retainageWithheld = retainageReleases.reduce(
      (sum, r) => sum + Number(r.amountToRelease),
      0,
    );

    // ── Task performance ──────────────────────────────────────────────────────
    const doneTasks = tasks.filter((t) => t.status === "DONE");
    const completedOnTime = doneTasks.filter(
      (t) =>
        t.plannedEndDate !== null &&
        t.actualEndDate !== null &&
        t.actualEndDate <= t.plannedEndDate,
    ).length;
    const completedLate = doneTasks.filter(
      (t) =>
        t.plannedEndDate !== null &&
        t.actualEndDate !== null &&
        t.actualEndDate > t.plannedEndDate,
    ).length;
    const currentlyOverdue = tasks.filter(
      (t) =>
        t.status !== "DONE" &&
        t.status !== "CANCELLED" &&
        t.plannedEndDate !== null &&
        t.plannedEndDate < now,
    ).length;

    // ── Compliance ────────────────────────────────────────────────────────────
    // Get subcontractor IDs on this project
    const projectSubIds = new Set(contracts.map((c) => c.subcontractorId));
    const projectSubs = subcontractors.filter((s) => projectSubIds.has(s.id));

    const compliantCount = projectSubs.filter((s) => s.isCompliant).length;
    const nonCompliantCount = projectSubs.filter((s) => !s.isCompliant).length;

    const expiringInsurance = projectSubs
      .filter(
        (s) =>
          s.insuranceExpiry !== null &&
          s.insuranceExpiry >= now &&
          s.insuranceExpiry <= in30Days,
      )
      .map((s) => ({
        id: s.id,
        companyName: s.companyName,
        expiryDate: s.insuranceExpiry!.toISOString(),
      }));

    const expiringLicense = projectSubs
      .filter(
        (s) =>
          s.licenseExpiry !== null &&
          s.licenseExpiry >= now &&
          s.licenseExpiry <= in30Days,
      )
      .map((s) => ({
        id: s.id,
        companyName: s.companyName,
        expiryDate: s.licenseExpiry!.toISOString(),
      }));

    // ── Per-subcontractor rollup ───────────────────────────────────────────────
    const subMap = new Map(subcontractors.map((s) => [s.id, s]));

    const bySubcontractor: SubcontractorRollup[] = [];
    for (const subId of projectSubIds) {
      const sub = subMap.get(subId);
      if (!sub) continue;

      const subContract = contracts
        .filter((c) => c.subcontractorId === subId && c.status !== "TERMINATED")
        .reduce((sum, c) => sum + Number(c.contractValue), 0);

      const subTasks = tasks.filter((t) => t.subcontractorId === subId);
      const subCompleted = subTasks.filter((t) => t.status === "DONE").length;
      const subOverdue = subTasks.filter(
        (t) =>
          t.status !== "DONE" &&
          t.status !== "CANCELLED" &&
          t.plannedEndDate !== null &&
          t.plannedEndDate < now,
      ).length;

      bySubcontractor.push({
        subcontractorId: subId,
        companyName: sub.companyName,
        trade: sub.trade,
        contractValue: subContract,
        taskCount: subTasks.length,
        completedTasks: subCompleted,
        overdueTasks: subOverdue,
        rating: sub.rating !== null ? Number(sub.rating) : null,
      });
    }

    // Sort by contract value descending
    bySubcontractor.sort((a, b) => b.contractValue - a.contractValue);

    const metrics: SubcontractorMetrics = {
      projectId,
      computedAt: now.toISOString(),
      contracts: {
        total: contracts.length,
        active: activeContracts.length,
        totalContractValue,
        totalPaid,
        retainageWithheld,
      },
      taskPerformance: {
        totalAssignedTasks: tasks.length,
        completedOnTime,
        completedLate,
        currentlyOverdue,
      },
      complianceStatus: {
        compliantCount,
        nonCompliantCount,
        expiringInsurance,
        expiringLicense,
      },
      bySubcontractor,
    };

    await cacheSet(
      cacheKey.subcontractorMetrics(projectId),
      metrics,
      CACHE_TTL.REPORT_PROJECT,
    );
    return metrics;
  }

  async invalidate(projectId: string): Promise<void> {
    await cacheDel(
      cacheKey.subcontractorMetrics(projectId),
      cacheKey.projectFullReport(projectId),
    );
  }
}

export const subcontractorMetricsService = new SubcontractorMetricsService();
