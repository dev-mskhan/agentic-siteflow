import { router } from "./trpc.js";
import { healthRouter } from "./routers/health.router.js";
import { organizationRouter } from "../../modules/organizations/organization.router.js";
import { userRouter } from "../../modules/users/user.router.js";
import { authRouter } from "../../modules/auth/auth.router.js";
import { auditRouter } from "../../modules/audit/audit.router.js";
import { projectRouter } from "../../modules/projects/project.router.js";
import { costCodeRouter } from "../../modules/projects/cost-code.router.js";
import { estimateRouter } from "../../modules/estimating/estimate.router.js";
import { boqRouter } from "../../modules/estimating/boq.router.js";
import { ratesRouter } from "../../modules/estimating/rates.router.js";

/**
 * Root tRPC application router.
 * Merge domain routers here as new modules are added.
 */
export const appRouter = router({
  health: healthRouter,
  organization: organizationRouter,
  user: userRouter,
  auth: authRouter,
  audit: auditRouter,
  project: projectRouter,
  costCode: costCodeRouter,
  estimate: estimateRouter,
  boq: boqRouter,
  rates: ratesRouter,
});

// Export the inferred type for the client
export type AppRouter = typeof appRouter;
