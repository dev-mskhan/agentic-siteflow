import { PrismaClient } from "@prisma/client";
import { env } from "../../config/index.js";

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
