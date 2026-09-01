import type { Request, Response } from "express";
import type { OrgRole } from "@prisma/client";
import { REQUEST_ID_HEADER } from "../../middleware/index.js";
import { jwtHelper } from "../../modules/auth/../../infrastructure/jwt/jwt.js";

export interface AuthUser {
  id: string;
  orgId: string;
  email: string;
  role: OrgRole | null;
}

/**
 * tRPC context.
 * Extended with auth user and orgId for authenticated requests.
 */
export interface TrpcContext {
  requestId: string | undefined;
  req: Request;
  res: Response;
  user: AuthUser | null;
  orgId: string | null;
}

export function createContext({ req, res }: { req: Request; res: Response }): TrpcContext {
  const requestId =
    typeof req.headers[REQUEST_ID_HEADER] === "string" ? req.headers[REQUEST_ID_HEADER] : undefined;

  // Attempt to extract and verify JWT — don't throw if missing/invalid
  let user: AuthUser | null = null;
  let orgId: string | null = null;

  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const payload = jwtHelper.verify(token);
      user = {
        id: payload.sub,
        orgId: payload.orgId,
        email: payload.email,
        role: null, // role is loaded lazily per-procedure if needed
      };
      orgId = payload.orgId;
    } catch {
      // Invalid token — leave user as null; authedProcedure will handle UNAUTHORIZED
    }
  }

  return { requestId, req, res, user, orgId };
}
