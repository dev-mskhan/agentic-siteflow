/**
 * Standardized error response shape for all REST error responses.
 *
 * Shape:
 * {
 *   "success": false,
 *   "error": { "code": "...", "message": "..." },
 *   "requestId": "..."  // optional, omitted when unavailable
 * }
 */
export interface ErrorResponseBody {
  success: false;
  error: {
    code: string;
    message: string;
  };
  requestId?: string;
}

/**
 * Builds a typed error response object.
 * Use this helper in error handlers to guarantee a consistent shape.
 */
export function errorResponse(
  code: string,
  message: string,
  requestId?: string,
): ErrorResponseBody {
  const body: ErrorResponseBody = {
    success: false,
    error: { code, message },
  };
  if (requestId !== undefined) {
    body.requestId = requestId;
  }
  return body;
}
