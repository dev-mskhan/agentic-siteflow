import { initTRPC, TRPCError } from "@trpc/server";
import type { TrpcContext } from "./context.js";
import { hasPermission } from "../../modules/auth/rbac.js";
import type { Permission } from "../../modules/auth/permissions.js";

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

// Authenticated context type — user is guaranteed non-null
type AuthedTrpcContext = TrpcContext & { user: NonNullable<TrpcContext["user"]> };

const authMiddleware = t.middleware(async function auth({ ctx, next }) {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }
  return next<AuthedTrpcContext>({ ctx: { ...ctx, user: ctx.user } });
});

/**
 * Authenticated procedure — requires a valid JWT in the Authorization header.
 * Throws UNAUTHORIZED if missing or invalid.
 *
 * Cast to avoid deep Express type references in declaration files.
 * Runtime behavior: enforces authentication via authMiddleware.
 */
export const authedProcedure = t.procedure.use(authMiddleware) as unknown as typeof t.procedure;

/**
 * Permission-checked procedure factory.
 * Wraps authedProcedure and checks that the user's org role has the required permission.
 * Throws FORBIDDEN if they don't.
 */
export function permissionProcedure(permission: Permission): typeof t.procedure {
  const p = publicProcedure
    .use(authMiddleware)
    .use(
      t.middleware(async function checkPermission({ ctx, next }) {
        const user = (ctx as AuthedTrpcContext).user;
        if (!user.role || !hasPermission(user.role, permission)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" });
        }
        return next({ ctx });
      }),
    );
  return p;
}

// Type guard to prevent accidental import cycles
export type { TRPCError };
