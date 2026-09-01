import type { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Attaches a unique request ID to every incoming request.
 * Uses the incoming X-Request-Id header if present, otherwise generates one.
 * The ID is also set on the response headers for client-side tracing.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existing = req.headers[REQUEST_ID_HEADER];
  const requestId = typeof existing === "string" && existing.length > 0 ? existing : uuidv4();

  req.headers[REQUEST_ID_HEADER] = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}
