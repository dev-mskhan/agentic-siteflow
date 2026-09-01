import type { Request, Response } from "express";
import { REQUEST_ID_HEADER } from "../../middleware/index.js";

/**
 * Base tRPC context.
 * Populated for every incoming request.
 * Future phases will extend this with: auth user, tenant scope, etc.
 */
export interface TrpcContext {
  requestId: string | undefined;
  req: Request;
  res: Response;
}

export function createContext({ req, res }: { req: Request; res: Response }): TrpcContext {
  const requestId =
    typeof req.headers[REQUEST_ID_HEADER] === "string" ? req.headers[REQUEST_ID_HEADER] : undefined;

  return { requestId, req, res };
}
