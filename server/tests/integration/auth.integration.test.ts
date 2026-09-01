/**
 * Integration tests for authentication and RBAC middleware.
 *
 * These tests use the real Express app with mocked JWT verification
 * to verify that auth middleware correctly grants/denies access.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createTestApp } from "../utils/app-factory.js";

// ─── Mock the JWT helper to control auth behavior ─────────────────────────────

vi.mock("../../src/infrastructure/jwt/jwt.js", () => ({
  jwtHelper: {
    sign: vi.fn().mockReturnValue("mock-token"),
    verify: vi.fn().mockImplementation((token: string) => {
      if (token === "valid-token") {
        return { sub: "user_1", orgId: "org_1", email: "alice@example.com" };
      }
      throw new Error("Invalid token");
    }),
  },
  createJwtHelper: vi.fn(),
}));

// ─── Mock the organization service to avoid DB calls ─────────────────────────

vi.mock("../../src/modules/organizations/organization.service.js", () => ({
  OrganizationService: vi.fn().mockImplementation(() => ({
    createOrganization: vi.fn(),
    getOrganization: vi.fn().mockResolvedValue({
      id: "org_1",
      name: "Acme",
      slug: "acme",
      plan: "free",
      status: "ACTIVE",
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    updateOrganization: vi.fn(),
    inviteUser: vi.fn(),
    acceptInvitation: vi.fn(),
    removeMember: vi.fn(),
    listMembers: vi.fn().mockResolvedValue([]),
  })),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Auth middleware — tRPC procedures", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
  });

  it("returns UNAUTHORIZED (401) for unauthenticated request to organization.get", async () => {
    const res = await request(app)
      .get("/trpc/organization.get?input=" + encodeURIComponent(JSON.stringify({ id: "org_1" })))
      .set("Content-Type", "application/json");

    // tRPC returns 401 for UNAUTHORIZED
    expect(res.status).toBe(401);
  });

  it("returns 200 for authenticated request to organization.get with valid token", async () => {
    const res = await request(app)
      .get("/trpc/organization.get?input=" + encodeURIComponent(JSON.stringify({ id: "org_1" })))
      .set("Authorization", "Bearer valid-token")
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
  });

  it("returns UNAUTHORIZED for request with invalid/malformed token", async () => {
    const res = await request(app)
      .get("/trpc/organization.get?input=" + encodeURIComponent(JSON.stringify({ id: "org_1" })))
      .set("Authorization", "Bearer invalid-bad-token")
      .set("Content-Type", "application/json");

    expect(res.status).toBe(401);
  });
});
