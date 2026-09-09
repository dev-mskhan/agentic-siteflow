import { PrismaClient } from "@prisma/client";
import { env } from "../../config/index.js";

/**
 * Row-Level Security (RLS) — Infrastructure Note
 *
 * The migration at 20260909200000_rls creates RLS policies on high-value tables
 * (projects, cost_transactions, invoices, payment_applications) for the siteflow_app role.
 *
 * To activate RLS enforcement, the app must set `app.org_id` per DB session:
 *   await db.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`;
 *
 * This requires orgId to be available at the DB-client level. The current architecture
 * passes orgId through the service layer but not into the Prisma singleton.
 *
 * Activation path:
 *   1. Thread orgId into a per-request db client (via AsyncLocalStorage or middleware)
 *   2. Set app.org_id at transaction/session start
 *   3. Connect the app as siteflow_app (not postgres superuser)
 *
 * The migration is additive — RLS policies exist but the current app connects as the
 * superuser role which bypasses RLS by default. This provides the policy scaffolding
 * without breaking existing functionality.
 */

/**
 * Singleton PrismaClient — import `db` everywhere.
 * Do NOT instantiate PrismaClient directly in application code.
 *
 * In test environments, a fresh client is still created per process but
 * the singleton ensures only one instance exists at a time.
 */
const db = new PrismaClient({
  log:
    env.NODE_ENV === "development"
      ? ["query", "warn", "error"]
      : env.NODE_ENV === "test"
        ? ["warn", "error"]
        : ["warn", "error"],
});

/**
 * Gracefully disconnect the Prisma client.
 * Call this during server shutdown (SIGINT / SIGTERM).
 */
async function disconnectDb(): Promise<void> {
  await db.$disconnect();
}

export { db, disconnectDb };
