import type { Prisma, QuotaType } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import { ForbiddenError } from "../../common/index.js";

export interface QuotaStatus {
  used: number;
  limit: number;
  remaining: number;
}

/**
 * Default quota limits seeded for every new organization on the free plan.
 * AI quota types are present but set to limit=0 (not enforced until Phase 10).
 */
export const DEFAULT_QUOTAS: Record<string, { limitValue: number; resetPeriod: string }> = {
  PROJECTS:          { limitValue: 10,           resetPeriod: "NONE" },
  MEMBERS:           { limitValue: 20,            resetPeriod: "NONE" },
  STORAGE_BYTES:     { limitValue: 5_368_709_120, resetPeriod: "NONE" }, // 5 GiB
  AI_TOKENS_DAILY:   { limitValue: 0,             resetPeriod: "DAILY" }, // locked until Phase 10
  AI_REQUESTS_DAILY: { limitValue: 0,             resetPeriod: "DAILY" }, // locked until Phase 10
};

export class QuotaService {
  /**
   * Get the current usage vs limit for a quota type.
   * Returns { used: 0, limit: 0, remaining: 0 } if no quota record exists
   * (treat as no enforcement — allow).
   */
  async getQuotaStatus(orgId: string, quotaType: QuotaType): Promise<QuotaStatus> {
    const record = await db.tenantQuota.findUnique({
      where: { orgId_quotaType: { orgId, quotaType } },
      select: { limitValue: true, currentUsage: true },
    });
    if (!record) return { used: 0, limit: 0, remaining: 0 };
    return {
      used: record.currentUsage,
      limit: record.limitValue,
      remaining: Math.max(0, record.limitValue - record.currentUsage),
    };
  }

  /**
   * Assert the quota is not exceeded. Throws ForbiddenError if limit is reached.
   *
   * AI quota types (AI_TOKENS_DAILY, AI_REQUESTS_DAILY) are silently skipped
   * until Phase 10 enforcement is added.
   * If no quota record exists → allow (no enforcement).
   */
  async assertQuota(orgId: string, quotaType: QuotaType, requestedAmount = 1): Promise<void> {
    // AI quotas not enforced until Phase 10
    if (quotaType === "AI_TOKENS_DAILY" || quotaType === "AI_REQUESTS_DAILY") return;

    const status = await this.getQuotaStatus(orgId, quotaType);
    // No record = no limit configured → allow
    if (status.limit === 0 && status.used === 0) return;

    if (status.used + requestedAmount > status.limit) {
      throw new ForbiddenError(
        `Quota exceeded for ${quotaType}. Used: ${status.used}, Limit: ${status.limit}`,
      );
    }
  }

  /**
   * Increment usage after a successful resource creation.
   * Silently no-ops if the quota record doesn't exist.
   */
  async incrementUsage(orgId: string, quotaType: QuotaType, amount = 1): Promise<void> {
    await db.tenantQuota.updateMany({
      where: { orgId, quotaType },
      data: { currentUsage: { increment: amount } },
    });
  }

  /**
   * Decrement usage after resource deletion.
   * Clamps to 0 — never goes negative.
   */
  async decrementUsage(orgId: string, quotaType: QuotaType, amount = 1): Promise<void> {
    const record = await db.tenantQuota.findUnique({
      where: { orgId_quotaType: { orgId, quotaType } },
      select: { currentUsage: true },
    });
    if (!record) return;
    await db.tenantQuota.update({
      where: { orgId_quotaType: { orgId, quotaType } },
      data: { currentUsage: Math.max(0, record.currentUsage - amount) },
    });
  }

  /**
   * Seed default quota records for a new organization.
   * Must be called inside the org creation database transaction.
   */
  async seedDefaults(orgId: string, tx: Prisma.TransactionClient): Promise<void> {
    const records = Object.entries(DEFAULT_QUOTAS).map(([quotaType, config]) => ({
      orgId,
      quotaType: quotaType as QuotaType,
      limitValue: config.limitValue,
      resetPeriod: config.resetPeriod as "NONE" | "DAILY" | "MONTHLY",
    }));
    await tx.tenantQuota.createMany({ data: records });
  }
}

export const quotaService = new QuotaService();
