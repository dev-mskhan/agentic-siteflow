/**
 * Unit tests for OrganizationService invitation flows.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrganizationService } from "../../src/modules/organizations/organization.service.js";
import { ConflictError, NotFoundError, ValidationError } from "../../src/common/AppError.js";
import type { OrganizationRepository } from "../../src/modules/organizations/organization.repository.js";
import type { InvitationRepository } from "../../src/modules/organizations/invitation.repository.js";
import type { Invitation } from "@prisma/client";

// ─── Mock db client ───────────────────────────────────────────────────────────

vi.mock("../../src/infrastructure/database/client.js", () => ({
  db: {
    organizationMember: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue({ orgId: "org_1", userId: "user_2", role: "MEMBER" }),
      delete: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    invitation: {
      update: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        organizationMember: {
          create: vi.fn().mockResolvedValue({
            orgId: "org_1",
            userId: "user_2",
            role: "MEMBER",
            joinedAt: new Date(),
            invitedBy: "user_1",
          }),
        },
        invitation: {
          update: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    }),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockOrgRepo(): OrganizationRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue({ id: "org_1", name: "Acme", slug: "acme" }),
    findBySlug: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
    findAll: vi.fn(),
  } as unknown as OrganizationRepository;
}

function makeMockInvitationRepo(
  overrides?: Partial<Record<keyof InvitationRepository, unknown>>,
): InvitationRepository {
  return {
    create: vi.fn().mockResolvedValue({ id: "inv_1", token: "test-token" }),
    findByToken: vi.fn().mockResolvedValue(null),
    findByOrgAndEmail: vi.fn().mockResolvedValue(null),
    accept: vi.fn().mockResolvedValue(undefined),
    revoke: vi.fn().mockResolvedValue(undefined),
    expireOld: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as InvitationRepository;
}

function makeInvitation(overrides?: Partial<Invitation>): Invitation {
  return {
    id: "inv_1",
    orgId: "org_1",
    email: "bob@example.com",
    role: "MEMBER",
    token: "valid-token",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    invitedById: "user_1",
    acceptedAt: null,
    createdAt: new Date(),
    status: "PENDING",
    ...overrides,
  };
}

// ─── inviteUser ───────────────────────────────────────────────────────────────

describe("OrganizationService.inviteUser", () => {
  let invitationRepo: InvitationRepository;
  let service: OrganizationService;

  beforeEach(async () => {
    const { db } = await import("../../src/infrastructure/database/client.js");
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue(null);
    invitationRepo = makeMockInvitationRepo();
    service = new OrganizationService(makeMockOrgRepo(), invitationRepo);
  });

  it("creates an invitation with a token and expiry", async () => {
    const result = await service.inviteUser("org_1", {
      email: "bob@example.com",
      invitedById: "user_1",
    });

    expect(result.token).toBeTruthy();
    expect(result.email).toBe("bob@example.com");
    expect(invitationRepo.create).toHaveBeenCalledOnce();
    const call = vi.mocked(invitationRepo.create).mock.calls[0]![0];
    expect(call.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("throws ConflictError when user is already a member of the organization", async () => {
    const { db } = await import("../../src/infrastructure/database/client.js");
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      orgId: "org_1",
      userId: "user_2",
      role: "MEMBER",
      joinedAt: new Date(),
      invitedBy: null,
    } as never);

    await expect(
      service.inviteUser("org_1", { email: "existing@example.com", invitedById: "user_1" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(invitationRepo.create).not.toHaveBeenCalled();
  });
});

// ─── acceptInvitation ─────────────────────────────────────────────────────────

describe("OrganizationService.acceptInvitation", () => {
  let invitationRepo: InvitationRepository;
  let service: OrganizationService;

  beforeEach(() => {
    invitationRepo = makeMockInvitationRepo({
      findByToken: vi.fn().mockResolvedValue(makeInvitation()),
    });
    service = new OrganizationService(makeMockOrgRepo(), invitationRepo);
  });

  it("creates membership and marks invitation accepted", async () => {
    const result = await service.acceptInvitation("valid-token", "user_2");

    expect(result.orgId).toBe("org_1");
    expect(result.userId).toBe("user_2");
  });

  it("throws NotFoundError for an invalid/unknown token", async () => {
    invitationRepo = makeMockInvitationRepo({
      findByToken: vi.fn().mockResolvedValue(null),
    });
    service = new OrganizationService(makeMockOrgRepo(), invitationRepo);

    await expect(service.acceptInvitation("bad-token", "user_2")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("throws ValidationError for an expired invitation", async () => {
    invitationRepo = makeMockInvitationRepo({
      findByToken: vi.fn().mockResolvedValue(
        makeInvitation({ expiresAt: new Date(Date.now() - 1000) }),
      ),
    });
    service = new OrganizationService(makeMockOrgRepo(), invitationRepo);

    await expect(service.acceptInvitation("expired-token", "user_2")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("throws ValidationError for an already-accepted invitation", async () => {
    invitationRepo = makeMockInvitationRepo({
      findByToken: vi.fn().mockResolvedValue(makeInvitation({ status: "ACCEPTED" })),
    });
    service = new OrganizationService(makeMockOrgRepo(), invitationRepo);

    await expect(service.acceptInvitation("accepted-token", "user_2")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
