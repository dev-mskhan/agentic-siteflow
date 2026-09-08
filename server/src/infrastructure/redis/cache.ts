import { redis } from "./client.js";
import { logger } from "../logger.js";

/**
 * Cache-aside helper utilities built on the shared ioredis singleton.
 *
 * All functions are best-effort: errors are logged as warnings but never thrown,
 * so a Redis outage degrades gracefully rather than taking down the application.
 *
 * Usage pattern:
 *   // Read path
 *   const cached = await cacheGet<MyType>(cacheKey.project(id));
 *   if (cached) return cached;
 *   const result = await repo.findById(id);
 *   await cacheSet(cacheKey.project(id), result, CACHE_TTL.PROJECT);
 *   return result;
 *
 *   // Write path (after DB mutation)
 *   await cacheDel(cacheKey.project(id), cacheKey.projectList(orgId));
 */

/**
 * Retrieve a cached value. Returns null on miss or parse error.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const val = await redis.get(key);
    if (val === null) return null;
    return JSON.parse(val) as T;
  } catch (err) {
    logger.warn({ err, key }, "cache.get error");
    return null;
  }
}

/**
 * Store a value with a TTL in seconds.
 */
export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    logger.warn({ err, key }, "cache.set error");
  }
}

/**
 * Delete one or more specific keys.
 */
export async function cacheDel(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (err) {
    logger.warn({ err, keys }, "cache.del error");
  }
}

/**
 * Delete all keys matching a glob pattern (e.g. `fin:project:*`).
 *
 * Uses KEYS which is acceptable for cache invalidation on low-cardinality patterns.
 * Do NOT use this on hot read paths.
 */
export async function cacheDelPattern(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    logger.warn({ err, pattern }, "cache.delPattern error");
  }
}

// ─── Structured key builders ─────────────────────────────────────────────────

/**
 * Centralized cache key factory.
 * Using structured keys prevents collisions and makes invalidation explicit.
 */
export const cacheKey = {
  /** Single project by ID (5 min TTL) */
  project: (id: string) => `project:${id}`,
  /** Project list for an organization (3 min TTL) */
  projectList: (orgId: string) => `projects:org:${orgId}`,
  /** Single estimate by ID (10 min TTL) */
  estimate: (id: string) => `estimate:${id}`,
  /** Organization members + org detail (10 min TTL) */
  orgMembers: (orgId: string) => `org:${orgId}:members`,
  /** Project budget summary (5 min TTL) */
  projectBudget: (projectId: string) => `budget:project:${projectId}`,
  /** Project financial overview / variance (3 min TTL) */
  financialOverview: (projectId: string) => `fin:project:${projectId}`,
  /** Organization-wide financial overview (3 min TTL) */
  orgFinancialOverview: (orgId: string) => `fin:org:${orgId}`,
  /** Compliance records list for an org (5 min TTL) */
  complianceList: (orgId: string) => `compliance:org:${orgId}`,
  /** Cost codes for an org (30 min TTL) */
  costCodes: (orgId: string) => `cost-codes:org:${orgId}`,
  /** Rate cards for an org (30 min TTL) */
  rateCards: (orgId: string) => `rate-cards:org:${orgId}`,
  // ─── Phase 9: Reporting ────────────────────────────────────────────────────
  /** Project health snapshot (5 min TTL) */
  projectHealth: (projectId: string) => `health:project:${projectId}`,
  /** Schedule metrics for a project (5 min TTL) */
  scheduleMetrics: (projectId: string) => `schedule:metrics:${projectId}`,
  /** Cost metrics for a project (3 min TTL) */
  costMetrics: (projectId: string) => `cost:metrics:${projectId}`,
  /** Procurement metrics for a project (5 min TTL) */
  procurementMetrics: (projectId: string) => `procurement:metrics:${projectId}`,
  /** Subcontractor metrics for a project (5 min TTL) */
  subcontractorMetrics: (projectId: string) => `sub:metrics:${projectId}`,
  /** Full combined project report (3 min TTL) */
  projectFullReport: (projectId: string) => `report:full:${projectId}`,
  /** Org executive dashboard (3 min TTL) */
  orgDashboard: (orgId: string) => `exec:dashboard:${orgId}`,
} as const;

// ─── TTL constants (in seconds) ──────────────────────────────────────────────

/**
 * Domain-specific TTL values calibrated to data churn rate.
 * Higher churn = shorter TTL.
 */
export const CACHE_TTL = {
  /** 5 minutes — project detail changes moderately */
  PROJECT: 300,
  /** 3 minutes — project list changes frequently (new projects, status changes) */
  PROJECT_LIST: 180,
  /** 10 minutes — estimates are relatively stable */
  ESTIMATE: 600,
  /** 10 minutes — org membership changes are infrequent */
  ORG_MEMBERS: 600,
  /** 5 minutes — budget changes on change order approval */
  BUDGET: 300,
  /** 3 minutes — financial data changes on every cost transaction / payment */
  FINANCIAL: 180,
  /** 30 minutes — cost codes rarely change */
  COST_CODES: 1800,
  /** 30 minutes — rate cards rarely change */
  RATE_CARDS: 1800,
  /** 5 minutes — compliance records updated by background worker */
  COMPLIANCE: 300,
  // ─── Phase 9: Reporting ────────────────────────────────────────────────────
  /** 5 minutes — project-level reports (health, schedule, procurement, subcontractors) */
  REPORT_PROJECT: 300,
  /** 3 minutes — cost metrics and org dashboard (higher churn due to financial writes) */
  REPORT_ORG: 180,
} as const;
