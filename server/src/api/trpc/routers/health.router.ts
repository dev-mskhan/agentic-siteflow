import { router, publicProcedure } from "../trpc.js";

/**
 * Health router — minimal proof-of-wiring for tRPC.
 * Does NOT replace the REST /health and /ready endpoints.
 */
export const healthRouter = router({
  ping: publicProcedure.query(() => {
    return { status: "ok" as const, timestamp: new Date().toISOString() };
  }),
});
