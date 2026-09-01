import type { Request, Response, NextFunction } from "express";
import { AppError } from "../common/index.js";
import { errorResponse } from "../common/response.js";
import { logger } from "../infrastructure/logger.js";
import { REQUEST_ID_HEADER } from "./requestId.js";

/**
 * Global error handler.
 * Must be registered LAST (after all routes and other middleware).
 * Translates AppError instances into structured JSON responses.
 * Unknown errors are treated as 500 Internal Server Error.
 *
 * All error responses follow the contract:
 *   { success: false, error: { code, message }, requestId? }
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // next is required for Express to treat this as an error handler
  _next: NextFunction,
): void {
  const requestId =
    typeof req.headers[REQUEST_ID_HEADER] === "string" ? req.headers[REQUEST_ID_HEADER] : undefined;

  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error({ err, requestId }, "Non-operational AppError");
    } else {
      logger.warn({ err, requestId, code: err.code }, err.message);
    }

    res.status(err.statusCode).json(errorResponse(err.code, err.message, requestId));
    return;
  }

  // Unknown / unexpected error — do not leak internals
  logger.error({ err, requestId }, "Unhandled error");

  res
    .status(500)
    .json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred", requestId));
}
