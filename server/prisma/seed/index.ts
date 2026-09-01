import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Database seed — foundation script.
 *
 * Phase 0.2: No data to seed yet.
 * Add domain seed data here as modules are implemented in later phases.
 *
 * Example (Phase 1+):
 *   await prisma.organization.create({ data: { ... } });
 */
async function main(): Promise<void> {
  // TODO: add seed data here in Phase 1+
  console.log("Seed complete");
}

main()
  .catch((err: unknown) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
