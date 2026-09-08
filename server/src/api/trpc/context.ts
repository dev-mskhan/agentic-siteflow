import type { Request, Response } from "express";
import type { OrgRole } from "@prisma/client";
import { REQUEST_ID_HEADER } from "../../middleware/index.js";
import { jwtHelper } from "../../infrastructure/jwt/jwt.js";
import { db } from "../../infrastructure/database/client.js";

export interface AuthUser {
  id: string;
  orgId: string;
  email: string;
  role: OrgRole; // non-nullable — always loaded from DB
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

/**
 * Async context factory.
 *
 * For every request carrying a valid Bearer JWT:
 *  1. Verify the JWT → extract { sub, orgId, email }
 *  2. Load the OrgRole from organization_members
 *  3. If the membership record doesn't exist → user = null (UNAUTHORIZED downstream)
 *
 * The DB lookup is a single indexed PK query (orgId_userId compound primary key)
 * and adds ~1-3 ms to every authenticated request — well within the latency budget.
 */
export async function createContext({
  req,
  res,
}: {
  req: Request;
  res: Response;
}): Promise<TrpcContext> {
  const requestId =
    typeof req.headers[REQUEST_ID_HEADER] === "string"
      ? req.headers[REQUEST_ID_HEADER]
      : undefined;

  let user: AuthUser | null = null;
  let orgId: string | null = null;

  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const payload = jwtHelper.verify(token);

      // Load role from DB — fast compound PK lookup
      const membership = await db.organizationMember.findUnique({
        where: {
          orgId_userId: { orgId: payload.orgId, userId: payload.sub },
        },
        select: { role: true },
      });

      if (membership) {
        user = {
          id: payload.sub,
          orgId: payload.orgId,
          email: payload.email,
          role: membership.role,
        };
        orgId = payload.orgId;
      }
      // If no membership → user stays null → UNAUTHORIZED in authedProcedure
    } catch {
      // Invalid JWT → user = null
    }
  }

  return { requestId, req, res, user, orgId };
}
