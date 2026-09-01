/**
 * Unit tests for AuthService session operations (refresh + logout).
 *
 * Tests the session rotation (refresh) and revocation (logout) flows.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import { UnauthorizedError } from "../../src/common/AppError.js";
import type { UserRepository } from "../../src/modules/users/user.repository.js";
import type { OrganizationRepository } from "../../src/modules/organizations/organization.repository.js";
import type { JwtHelper } from "../../src/infrastructure/jwt/jwt.js";
import type { SessionRepository } from "../../src/modules/auth/session.repository.js";
import type { Session } from "@prisma/client";

// ─── Mock db client ───────────────────────────────────────────────────────────

vi.mock("../../src/infrastructure/database/client.js", () => ({
  db: {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: "user_1",
        email: "alice@example.com",
        firstName: "Alice",
        lastName: "Smith",
        passwordHash: "hashed",
      }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: "user_1",
        email: "alice@example.com",
        firstName: "Alice",
        lastName: "Smith",
      }),
    },
    organization: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: "org_1",
        name: "Acme Corp",
        slug: "acme-corp",
      }),
    },
    organizationMember: {
      findFirst: vi.fn().mockResolvedValue({
        orgId: "org_1",
        userId: "user_1",
        organization: { id: "org_1", name: "Acme Corp", slug: "acme-corp" },
      }),
    },
    $transaction: vi.fn(),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides?: Partial<Session>): Session {
  return {
    id: "session_1",
    userId: "user_1",
    orgId: "org_1",
    refreshToken: "valid-refresh-token",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    lastUsedAt: new Date(),
    ipAddress: null,
    userAgent: null,
    isRevoked: false,
    ...overrides,
  };
}

function makeMockSessionRepo(
  overrides?: Partial<Record<keyof SessionRepository, unknown>>,
): SessionRepository {
  return {
    create: vi.fn().mockResolvedValue(makeSession({ refreshToken: "new-refresh-token" })),
    findByRefreshToken: vi.fn().mockResolvedValue(makeSession()),
    revoke: vi.fn().mockResolvedValue(undefined),
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
    deleteExpired: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SessionRepository;
}

function makeMockUserRepo(): UserRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByEmail: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
  } as unknown as UserRepository;
}

function makeMockOrgRepo(): OrganizationRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
    findAll: vi.fn(),
  } as unknown as OrganizationRepository;
}

function makeMockJwt(): JwtHelper {
  return {
    sign: vi.fn().mockReturnValue("new-access-token"),
    verify: vi.fn(),
  };
}

// ─── AuthService.refreshToken ─────────────────────────────────────────────────

describe("AuthService.refreshToken", () => {
  let sessionRepo: SessionRepository;
  let service: AuthService;

  beforeEach(() => {
    sessionRepo = makeMockSessionRepo();
    service = new AuthService(makeMockUserRepo(), makeMockOrgRepo(), makeMockJwt(), sessionRepo);
  });

  it("returns new tokens when a valid refresh token is provided", async () => {
    const result = await service.refreshToken("valid-refresh-token");

    expect(result.accessToken).toBe("new-access-token");
    expect(result.refreshToken).toBeTruthy();
    expect(result.refreshToken).not.toBe("valid-refresh-token"); // token is rotated
    expect(sessionRepo.revoke).toHaveBeenCalledWith("session_1");
    expect(sessionRepo.create).toHaveBeenCalledOnce();
  });

  it("throws UnauthorizedError when refresh token is not found", async () => {
    sessionRepo = makeMockSessionRepo({
      findByRefreshToken: vi.fn().mockResolvedValue(null),
    });
    service = new AuthService(makeMockUserRepo(), makeMockOrgRepo(), makeMockJwt(), sessionRepo);

    await expect(service.refreshToken("unknown-token")).rejects.toBeInstanceOf(UnauthorizedError);
    expect(sessionRepo.create).not.toHaveBeenCalled();
  });

  it("throws UnauthorizedError when session is revoked", async () => {
    sessionRepo = makeMockSessionRepo({
      findByRefreshToken: vi.fn().mockResolvedValue(makeSession({ isRevoked: true })),
    });
    service = new AuthService(makeMockUserRepo(), makeMockOrgRepo(), makeMockJwt(), sessionRepo);

    await expect(service.refreshToken("revoked-token")).rejects.toBeInstanceOf(UnauthorizedError);
    expect(sessionRepo.create).not.toHaveBeenCalled();
  });

  it("throws UnauthorizedError when session is expired", async () => {
    sessionRepo = makeMockSessionRepo({
      findByRefreshToken: vi.fn().mockResolvedValue(
        makeSession({ expiresAt: new Date(Date.now() - 1000) }),
      ),
    });
    service = new AuthService(makeMockUserRepo(), makeMockOrgRepo(), makeMockJwt(), sessionRepo);

    await expect(service.refreshToken("expired-token")).rejects.toBeInstanceOf(UnauthorizedError);
    expect(sessionRepo.create).not.toHaveBeenCalled();
  });
});

// ─── AuthService.logout ───────────────────────────────────────────────────────

describe("AuthService.logout", () => {
  let sessionRepo: SessionRepository;
  let service: AuthService;

  beforeEach(() => {
    sessionRepo = makeMockSessionRepo();
    service = new AuthService(makeMockUserRepo(), makeMockOrgRepo(), makeMockJwt(), sessionRepo);
  });

  it("revokes the session when given a valid refresh token", async () => {
    await service.logout("valid-refresh-token");

    expect(sessionRepo.findByRefreshToken).toHaveBeenCalledWith("valid-refresh-token");
    expect(sessionRepo.revoke).toHaveBeenCalledWith("session_1");
  });

  it("is idempotent — does not throw if session is already revoked", async () => {
    sessionRepo = makeMockSessionRepo({
      findByRefreshToken: vi.fn().mockResolvedValue(makeSession({ isRevoked: true })),
    });
    service = new AuthService(makeMockUserRepo(), makeMockOrgRepo(), makeMockJwt(), sessionRepo);

    await expect(service.logout("already-revoked-token")).resolves.toBeUndefined();
    expect(sessionRepo.revoke).not.toHaveBeenCalled();
  });

  it("does not throw if refresh token is not found", async () => {
    sessionRepo = makeMockSessionRepo({
      findByRefreshToken: vi.fn().mockResolvedValue(null),
    });
    service = new AuthService(makeMockUserRepo(), makeMockOrgRepo(), makeMockJwt(), sessionRepo);

    await expect(service.logout("nonexistent-token")).resolves.toBeUndefined();
    expect(sessionRepo.revoke).not.toHaveBeenCalled();
  });
});
