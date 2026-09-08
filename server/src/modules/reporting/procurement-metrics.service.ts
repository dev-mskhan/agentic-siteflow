import type { PurchaseOrderStatus } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import { cacheGet, cacheSet, cacheDel, cacheKey, CACHE_TTL } from "../../infrastructure/redis/cache.js";
import { NotFoundError } from "../../common/index.js";
import type { ProcurementMetrics } from "./procurement-metrics.types.js";

const ALL_PO_STATUSES: PurchaseOrderStatus[] = [
  "DRAFT",
  "ISSUED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CANCELLED",
];

export class ProcurementMetricsService {
  async getProcurementMetrics(orgId: string, projectId: string): Promise<ProcurementMetrics> {
    const cached = await cacheGet<ProcurementMetrics>(cacheKey.procurementMetrics(projectId));
    if (cached) return cached;

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, orgId: true },
    });
    if (!project || project.orgId !== orgId) {
      throw new NotFoundError("Project not found");
    }

    const now = new Date();

    const [materialRequests, purchaseOrders, deliveries] = await Promise.all([
      db.materialRequest.findMany({
        where: { projectId, orgId },
        select: { status: true },
      }),
      db.purchaseOrder.findMany({
        where: { projectId, orgId },
        select: {
          status: true,
          totalAmount: true,
          expectedDeliveryDate: true,
        },
      }),
      db.delivery.findMany({
        where: { projectId, orgId },
        select: {
          status: true,
          isDelayed: true,
          delayedDays: true,
          expectedDate: true,
          purchaseOrder: {
            select: {
              poNumber: true,
              vendor: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    // ── Material requests ──────────────────────────────────────────────────────
    const mrByStatus = {
      draft: materialRequests.filter((r) => r.status === "DRAFT").length,
      pending: materialRequests.filter((r) => r.status === "SUBMITTED").length,
      approved: materialRequests.filter((r) => r.status === "APPROVED").length,
      fulfilled: materialRequests.filter(
        (r) => r.status === "FULFILLED" || r.status === "PARTIALLY_FULFILLED",
      ).length,
      rejected: materialRequests.filter(
        (r) => r.status === "REJECTED" || r.status === "CANCELLED",
      ).length,
    };

    // ── Purchase orders ────────────────────────────────────────────────────────
    const byStatus = ALL_PO_STATUSES.reduce(
      (acc, s) => {
        acc[s] = purchaseOrders.filter((po) => po.status === s).length;
        return acc;
      },
      {} as Record<PurchaseOrderStatus, number>,
    );

    const totalCommittedValue = purchaseOrders
      .filter((po) => po.status !== "CANCELLED")
      .reduce((sum, po) => sum + Number(po.totalAmount), 0);

    const overdueDeliveries = purchaseOrders.filter(
      (po) =>
        po.expectedDeliveryDate !== null &&
        po.expectedDeliveryDate < now &&
        po.status !== "RECEIVED" &&
        po.status !== "CANCELLED",
    ).length;

    // ── Deliveries ─────────────────────────────────────────────────────────────
    const delayedDeliveries = deliveries.filter((d) => d.isDelayed);
    const totalDelayedDays = delayedDeliveries.reduce(
      (sum, d) => sum + (d.delayedDays ?? 0),
      0,
    );
    const pendingReceipt = deliveries.filter(
      (d) => d.status === "SCHEDULED" || d.status === "IN_TRANSIT",
    ).length;

    // Top 5 by delayed days
    const topDelayedItems = delayedDeliveries
      .sort((a, b) => (b.delayedDays ?? 0) - (a.delayedDays ?? 0))
      .slice(0, 5)
      .map((d) => ({
        poNumber: d.purchaseOrder.poNumber,
        vendorName: d.purchaseOrder.vendor.name,
        delayedDays: d.delayedDays ?? 0,
        expectedDate: d.expectedDate.toISOString(),
      }));

    const metrics: ProcurementMetrics = {
      projectId,
      computedAt: now.toISOString(),
      materialRequests: {
        total: materialRequests.length,
        ...mrByStatus,
      },
      purchaseOrders: {
        total: purchaseOrders.length,
        byStatus,
        totalCommittedValue,
        overdueDeliveries,
      },
      deliveries: {
        total: deliveries.length,
        onTime: deliveries.filter((d) => !d.isDelayed && d.status === "DELIVERED").length,
        delayed: delayedDeliveries.length,
        totalDelayedDays,
        pendingReceipt,
      },
      topDelayedItems,
    };

    await cacheSet(cacheKey.procurementMetrics(projectId), metrics, CACHE_TTL.REPORT_PROJECT);
    return metrics;
  }

  async invalidate(projectId: string): Promise<void> {
    await cacheDel(
      cacheKey.procurementMetrics(projectId),
      cacheKey.projectFullReport(projectId),
    );
  }
}

export const procurementMetricsService = new ProcurementMetricsService();
