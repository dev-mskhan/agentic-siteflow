/**
 * Unit tests for src/common/response.ts
 *
 * These are pure unit tests — no HTTP, no database, no Redis.
 * They verify errorResponse() produces the correct shape.
 */

import { describe, it, expect } from "vitest";
import { errorResponse } from "../../src/common/response.js";
import type { ErrorResponseBody } from "../../src/common/response.js";

describe("errorResponse()", () => {
  it("returns an object with success: false", () => {
    const body = errorResponse("SOME_CODE", "Some message");
    expect(body.success).toBe(false);
  });

  it("sets error.code correctly", () => {
    const body = errorResponse("NOT_FOUND", "Resource not found");
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("sets error.message correctly", () => {
    const body = errorResponse("NOT_FOUND", "Resource not found");
    expect(body.error.message).toBe("Resource not found");
  });

  it("omits requestId when not provided", () => {
    const body = errorResponse("CODE", "msg");
    expect(Object.keys(body)).not.toContain("requestId");
    expect(body.requestId).toBeUndefined();
  });

  it("includes requestId when provided", () => {
    const body = errorResponse("CODE", "msg", "req-123");
    expect(body.requestId).toBe("req-123");
  });

  it("produces exactly the expected shape with requestId", () => {
    const body = errorResponse("TEST_ERROR", "Test error message", "abc-456");
    expect(body).toEqual({
      success: false,
      error: { code: "TEST_ERROR", message: "Test error message" },
      requestId: "abc-456",
    });
  });

  it("produces exactly the expected shape without requestId", () => {
    const body = errorResponse("TEST_ERROR", "Test error message");
    expect(body).toEqual({
      success: false,
      error: { code: "TEST_ERROR", message: "Test error message" },
    });
  });

  it("satisfies the ErrorResponseBody type (success is narrowed to false)", () => {
    const body: ErrorResponseBody = errorResponse("CODE", "msg");
    // TypeScript narrows success to literal false — runtime confirms this
    expect(body.success).toBe(false);
  });

  it("top-level keys are exactly success, error, and optionally requestId", () => {
    const withoutId = errorResponse("CODE", "msg");
    expect(Object.keys(withoutId).sort()).toEqual(["error", "success"]);

    const withId = errorResponse("CODE", "msg", "id-789");
    expect(Object.keys(withId).sort()).toEqual(["error", "requestId", "success"]);
  });

  it("error object contains exactly code and message keys", () => {
    const body = errorResponse("CODE", "msg");
    expect(Object.keys(body.error).sort()).toEqual(["code", "message"]);
  });

  it("handles empty string for message", () => {
    const body = errorResponse("CODE", "");
    expect(body.error.message).toBe("");
  });

  it("handles special characters in message", () => {
    const msg = "Error: can't find <item> with id=42 & status='active'";
    const body = errorResponse("CODE", msg);
    expect(body.error.message).toBe(msg);
  });
});
