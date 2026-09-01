/**
 * Unit tests for AuthService.
 *
 * argon2, db, and repositories are fully mocked — no database or real hashing.
 * Tests verify: validation rules, email uniqueness, slug uniqueness,
 * password verification, and token generation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import { ConflictError, UnauthorizedError, ValidationError } from "../../src/common/AppError.js";
import type { UserRepository } from "../../src/modules/users/user.repository.js";
import type { OrganizationRepository } from "../../src/modules/organizations/organization.repository.js";
import type { JwtHelper } from "../../src/infrastructure/jwt/jwt.js";
import type { SessionRepository } from "../../src/modules/auth/session.repository.js";
import type { UserOutput } from "../../src/modules/users/user.types.js";
import type { OrganizationOutput } from "../../src/modules/organizations/organization.types.js";
import type { Session } from "@prisma/client";

// ─── Mock argon2 ─────────────────────────────────────────────────────────────

vi.mock("@node-rs/argon2", () => ({
  hash: vi.fn().mockResolvedValue("hashed-password"),
  verify: vi.fn().mockResolvedValue(true),
}));

// ─── Mock db client ───────────────────────────────────────────────────────────

vi.mock("../../src/infrastructure/database/client.js", () => ({
  db: {
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        organization: {
          create: vi.fn().mockResolvedValue(makeOrg()),
        },
        user: {
          create: vi.fn().mockResolvedValue(makeUser()),
        },
        organizationMember: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    }),
    user: {
      findUnique: vi.fn().mockResolvedValue({ ...makeUser(), passwordHash: "hashed-password" }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(makeUser()),
    },
    organizationMember: {
      findFirst: vi.fn().mockResolvedValue({
        orgId: "org_1",
        userId: "user_1",
        organization: makeOrg(),
      }),
    },
    organization: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(makeOrg()),
    },
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides?: Partial<UserOutput>): UserOutput {
  return {
    id: "user_1",
    email: "alice@example.com",
    emailVerified: false,
    firstName: "Alice",
    lastName: "Smith",
    avatarUrl: null,
    status: "ACTIVE",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function makeOrg(overrides?: Partial<OrganizationOutput>): OrganizationOutput {
  return {
    id: "org_1",
    name: "Acme Corp",
    slug: "acme-corp",
    plan: "free",
    status: "ACTIVE",
    settings: {},
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function makeSession(): Session {
  return {
    id: "session_1",
    userId: "user_1",
    orgId: "org_1",
    refreshToken: "refresh-token-abc",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    lastUsedAt: new Date(),
    ipAddress: null,
    userAgent: null,
    isRevoked: false,
  };
}

function makeMockUserRepo(
  overrides?: Partial<Record<keyof UserRepository, unknown>>,
): UserRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByEmail: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
    ...overrides,
  } as unknown as UserRepository;
}

function makeMockOrgRepo(
  overrides?: Partial<Record<keyof OrganizationRepository, unknown>>,
): OrganizationRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
    findAll: vi.fn(),
    ...overrides,
  } as unknown as OrganizationRepository;
}

function makeMockJwt(): JwtHelper {
  return {
    sign: vi.fn().mockReturnValue("access-token-abc"),
    verify: vi.fn(),
  };
}

function makeMockSessionRepo(
  overrides?: Partial<Record<keyof SessionRepository, unknown>>,
): SessionRepository {
  return {
    create: vi.fn().mockResolvedValue(makeSession()),
    findByRefreshToken: vi.fn().mockResolvedValue(makeSession()),
    revoke: vi.fn().mockResolvedValue(undefined),
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
    deleteExpired: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SessionRepository;
}

// ─── register ─────────────────────────────────────────────────────────────────

describe("AuthService.register", () => {
  let userRepo: UserRepository;
  let orgRepo: OrganizationRepository;
  let jwt: JwtHelper;
  let sessionRepo: SessionRepository;
  let service: AuthService;

  beforeEach(() => {
    userRepo = makeMockUserRepo();
    orgRepo = makeMockOrgRepo();
    jwt = makeMockJwt();
    sessionRepo = makeMockSessionRepo();
    service = new AuthService(userRepo, orgRepo, jwt, sessionRepo);
  });

  it("creates org+user+member and returns tokens (happy path)", async () => {
    const result = await service.register({
      organizationName: "Acme Corp",
      organizationSlug: "acme-corp",
      firstName: "Alice",
      lastName: "Smith",
      email: "alice@example.com",
      password: "password123",
    });

    expect(result.accessToken).toBe("access-token-abc");
    expect(result.refreshToken).toBeTruthy();
    expect(result.user.email).toBe("alice@example.com");
    expect(result.organization.slug).toBe("acme-corp");
    expect(sessionRepo.create).toHaveBeenCalledOnce();
  });

  it("throws ValidationError when password is less than 8 characters", async () => {
    await expect(
      service.register({
        organizationName: "Acme",
        organizationSlug: "acme",
        firstName: "Alice",
        lastName: "Smith",
        email: "alice@example.com",
        password: "short",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError when slug has invalid characters", async () => {
    await expect(
      service.register({
        organizationName: "Acme",
        organizationSlug: "Acme_Corp",
        firstName: "Alice",
        lastName: "Smith",
        email: "alice@example.com",
        password: "password123",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ConflictError when email is already registered", async () => {
    userRepo = makeMockUserRepo({ findByEmail: vi.fn().mockResolvedValue(makeUser()) });
    service = new AuthService(userRepo, orgRepo, jwt, sessionRepo);

    await expect(
      service.register({
        organizationName: "Acme",
        organizationSlug: "acme",
        firstName: "Alice",
        lastName: "Smith",
        email: "alice@example.com",
        password: "password123",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("throws ConflictError when organization slug is already taken", async () => {
    orgRepo = makeMockOrgRepo({ findBySlug: vi.fn().mockResolvedValue(makeOrg()) });
    service = new AuthService(userRepo, orgRepo, jwt, sessionRepo);

    await expect(
      service.register({
        organizationName: "Acme",
        organizationSlug: "acme-corp",
        firstName: "Alice",
        lastName: "Smith",
        email: "alice@example.com",
        password: "password123",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

// ─── login ────────────────────────────────────────────────────────────────────

describe("AuthService.login", () => {
  let userRepo: UserRepository;
  let orgRepo: OrganizationRepository;
  let jwt: JwtHelper;
  let sessionRepo: SessionRepository;
  let service: AuthService;

  beforeEach(async () => {
    const { verify } = await import("@node-rs/argon2");
    vi.mocked(verify).mockResolvedValue(true);

    userRepo = makeMockUserRepo({ findByEmail: vi.fn().mockResolvedValue(makeUser()) });
    orgRepo = makeMockOrgRepo();
    jwt = makeMockJwt();
    sessionRepo = makeMockSessionRepo();
    service = new AuthService(userRepo, orgRepo, jwt, sessionRepo);
  });

  it("returns tokens on correct credentials", async () => {
    const result = await service.login({
      email: "alice@example.com",
      password: "password123",
    });

    expect(result.accessToken).toBe("access-token-abc");
    expect(result.refreshToken).toBeTruthy();
    expect(result.user.email).toBe("alice@example.com");
    expect(sessionRepo.create).toHaveBeenCalledOnce();
  });

  it("throws UnauthorizedError when user is not found", async () => {
    userRepo = makeMockUserRepo({ findByEmail: vi.fn().mockResolvedValue(null) });
    service = new AuthService(userRepo, orgRepo, jwt, sessionRepo);

    await expect(
      service.login({ email: "nobody@example.com", password: "password123" }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws UnauthorizedError when password is wrong", async () => {
    const { verify } = await import("@node-rs/argon2");
    vi.mocked(verify).mockResolvedValue(false);

    await expect(
      service.login({ email: "alice@example.com", password: "wrong-password" }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("does NOT reveal whether email or password is wrong (same error message)", async () => {
    const userNotFound = makeMockUserRepo({ findByEmail: vi.fn().mockResolvedValue(null) });
    const svcNoUser = new AuthService(userNotFound, orgRepo, jwt, sessionRepo);

    const { verify } = await import("@node-rs/argon2");
    vi.mocked(verify).mockResolvedValue(false);
    const svcBadPass = new AuthService(userRepo, orgRepo, jwt, sessionRepo);

    let noUserErr: UnauthorizedError | undefined;
    let badPassErr: UnauthorizedError | undefined;

    try {
      await svcNoUser.login({ email: "nobody@example.com", password: "x" });
    } catch (e) {
      noUserErr = e as UnauthorizedError;
    }

    try {
      await svcBadPass.login({ email: "alice@example.com", password: "x" });
    } catch (e) {
      badPassErr = e as UnauthorizedError;
    }

    expect(noUserErr?.message).toBe(badPassErr?.message);
  });
});
