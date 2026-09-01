import { initTRPC } from "@trpc/server";
import type { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./context.js";

/**
 * tRPC initializer.
 * All routers and procedures are built from this instance.
 */
const t = initTRPC.context<TrpcContext>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Forward tRPC error code as a stable string consumers can rely on
        appCode: error.cause instanceof Error ? error.cause.message : shape.message,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const mergeRouters = t.mergeRouters;

// Type guard to prevent accidental import cycles
export type { TRPCError };
