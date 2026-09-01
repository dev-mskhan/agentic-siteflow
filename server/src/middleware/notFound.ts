import type { Request, Response, NextFunction } from "express";
import { NotFoundError } from "../common/index.js";

/**
 * Centralized 404 handler.
 * Mounted after all routes — any unmatched request lands here.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route not found: ${req.method} ${req.path}`));
}
