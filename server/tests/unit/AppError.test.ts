/**
 * Unit tests for src/common/AppError.ts
 *
 * These are pure unit tests — no HTTP, no database, no Redis.
 * They verify error class hierarchy, status codes, and error codes.
 */

import { describe, it, expect } from "vitest";
import { AppError, NotFoundError, ValidationError, InternalError } from "../../src/common/AppError.js";

describe("AppError", () => {
  it("extends Error", () => {
    const err = new AppError("something went wrong", 400, "BAD_INPUT");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it("sets message correctly", () => {
    const err = new AppError("test message", 400, "TEST_CODE");
    expect(err.message).toBe("test message");
  });

  it("sets statusCode correctly", () => {
    const err = new AppError("msg", 422, "UNPROCESSABLE");
    expect(err.statusCode).toBe(422);
  });

  it("sets code correctly", () => {
    const err = new AppError("msg", 400, "MY_CODE");
    expect(err.code).toBe("MY_CODE");
  });

  it("sets name to AppError", () => {
    const err = new AppError("msg", 400, "CODE");
    expect(err.name).toBe("AppError");
  });

  it("defaults isOperational to true", () => {
    const err = new AppError("msg", 400, "CODE");
    expect(err.isOperational).toBe(true);
  });

  it("accepts explicit isOperational = false", () => {
    const err = new AppError("msg", 500, "CODE", false);
    expect(err.isOperational).toBe(false);
  });

  it("has a stack trace", () => {
    const err = new AppError("msg", 400, "CODE");
    expect(typeof err.stack).toBe("string");
    expect(err.stack!.length).toBeGreaterThan(0);
  });

  it("can carry any HTTP status code", () => {
    const codes = [400, 401, 403, 404, 409, 422, 429, 500, 503];
    for (const code of codes) {
      const err = new AppError("msg", code, "CODE");
      expect(err.statusCode).toBe(code);
    }
  });
});

describe("NotFoundError", () => {
  it("extends AppError", () => {
    const err = new NotFoundError();
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(NotFoundError);
  });

  it("has statusCode 404", () => {
    const err = new NotFoundError();
    expect(err.statusCode).toBe(404);
  });

  it("has code NOT_FOUND", () => {
    const err = new NotFoundError();
    expect(err.code).toBe("NOT_FOUND");
  });

  it("uses default message when none provided", () => {
    const err = new NotFoundError();
    expect(err.message).toBe("Resource not found");
  });

  it("accepts a custom message", () => {
    const err = new NotFoundError("Project not found");
    expect(err.message).toBe("Project not found");
  });

  it("is operational by default", () => {
    const err = new NotFoundError();
    expect(err.isOperational).toBe(true);
  });
});

describe("ValidationError", () => {
  it("extends AppError", () => {
    const err = new ValidationError();
    expect(err).toBeInstanceOf(AppError);
  });

  it("has statusCode 400", () => {
    const err = new ValidationError();
    expect(err.statusCode).toBe(400);
  });

  it("has code VALIDATION_ERROR", () => {
    const err = new ValidationError();
    expect(err.code).toBe("VALIDATION_ERROR");
  });

  it("uses default message when none provided", () => {
    const err = new ValidationError();
    expect(err.message).toBe("Validation failed");
  });

  it("accepts a custom message", () => {
    const err = new ValidationError("Name is required");
    expect(err.message).toBe("Name is required");
  });
});

describe("InternalError", () => {
  it("extends AppError", () => {
    const err = new InternalError();
    expect(err).toBeInstanceOf(AppError);
  });

  it("has statusCode 500", () => {
    const err = new InternalError();
    expect(err.statusCode).toBe(500);
  });

  it("has code INTERNAL_ERROR", () => {
    const err = new InternalError();
    expect(err.code).toBe("INTERNAL_ERROR");
  });

  it("is NOT operational (isOperational = false)", () => {
    const err = new InternalError();
    expect(err.isOperational).toBe(false);
  });

  it("uses default message when none provided", () => {
    const err = new InternalError();
    expect(err.message).toBe("Internal server error");
  });
});
