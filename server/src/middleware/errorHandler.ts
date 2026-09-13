import type { Request, Response, NextFunction } from "express";
import { AppError } from "../common/index.js";
import { errorResponse } from "../common/response.js";
import { logger } from "../infrastructure/logger.js";
import { REQUEST_ID_HEADER } from "./requestId.js";
import { trace, SpanStatusCode } from "@opentelemetry/api";

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

  // ── Record error in the active OTEL span ──────────────────────────────────
  const activeSpan = trace.getActiveSpan();

  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error({ err, requestId }, "Non-operational AppError");
      // Mark span as ERROR for 5xx non-operational failures
      activeSpan?.recordException(err);
      activeSpan?.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    } else {
      logger.warn({ err, requestId, code: err.code }, err.message);
      // 4xx operational errors — still record exception for traceability, but not ERROR status
      activeSpan?.recordException(err);
    }

    res.status(err.statusCode).json(errorResponse(err.code, err.message, requestId));
    return;
  }

  // Unknown / unexpected error — do not leak internals
  logger.error({ err, requestId }, "Unhandled error");
  if (err instanceof Error) {
    activeSpan?.recordException(err);
  }
  activeSpan?.setStatus({ code: SpanStatusCode.ERROR, message: "Unhandled error" });

  res
    .status(500)
    .json(errorResponse("INTERNAL_ERROR", "An unexpected error occurred", requestId));
}

