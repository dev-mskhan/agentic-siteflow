import { router } from "./trpc.js";
import { healthRouter } from "./routers/health.router.js";

/**
 * Root tRPC application router.
 * Merge domain routers here as new modules are added.
 */
export const appRouter = router({
  health: healthRouter,
});

// Export the inferred type for the client
export type AppRouter = typeof appRouter;
