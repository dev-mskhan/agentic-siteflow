/**
 * Unit tests for OrganizationService.
 *
 * The repository is fully mocked — no database required.
 * Tests verify business rules: slug validation, uniqueness enforcement,
 * not-found handling, and correct delegation to the repository.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrganizationService } from "../../src/modules/organizations/organization.service.js";
import type { OrganizationRepository } from "../../src/modules/organizations/organization.repository.js";
import { ConflictError, NotFoundError, ValidationError } from "../../src/common/AppError.js";
import type { OrganizationOutput } from "../../src/modules/organizations/organization.types.js";
import type { CreateOrganizationInput } from "../../src/modules/organizations/organization.types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function makeMockRepo(
  overrides?: Partial<Record<keyof OrganizationRepository, unknown>>,
): OrganizationRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn(),
    update: vi.fn(),
    findAll: vi.fn(),
    ...overrides,
  } as unknown as OrganizationRepository;
}

// ─── createOrganization ───────────────────────────────────────────────────────

describe("OrganizationService.createOrganization", () => {
  let repo: OrganizationRepository;
  let service: OrganizationService;

  beforeEach(() => {
    repo = makeMockRepo({
      findBySlug: vi.fn().mockResolvedValue(null), // no conflict by default
      create: vi.fn().mockImplementation((input: CreateOrganizationInput) =>
        Promise.resolve(makeOrg({ name: input.name, slug: input.slug })),
      ),
    });
    service = new OrganizationService(repo);
  });

  it("creates an organization with valid input", async () => {
    const result = await service.createOrganization({ name: "Acme Corp", slug: "acme-corp" });

    expect(result.slug).toBe("acme-corp");
    expect(result.name).toBe("Acme Corp");
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it("rejects a slug with uppercase letters", async () => {
    await expect(
      service.createOrganization({ name: "Acme", slug: "AcmeCorp" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("rejects a slug with spaces", async () => {
    await expect(
      service.createOrganization({ name: "Acme", slug: "acme corp" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a slug with special characters (underscore)", async () => {
    await expect(
      service.createOrganization({ name: "Acme", slug: "acme_corp" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("accepts a slug with hyphens and digits", async () => {
    const result = await service.createOrganization({ name: "Org 123", slug: "org-123" });
    expect(result.slug).toBe("org-123");
  });

  it("throws ConflictError when slug is already taken", async () => {
    vi.mocked(repo.findBySlug).mockResolvedValue(makeOrg());

    await expect(
      service.createOrganization({ name: "Another", slug: "acme-corp" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("calls repo.create with the provided plan when given", async () => {
    await service.createOrganization({ name: "Paid", slug: "paid-org", plan: "pro" });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "pro" }),
    );
  });
});

// ─── getOrganization ──────────────────────────────────────────────────────────

describe("OrganizationService.getOrganization", () => {
  it("returns the organization when found", async () => {
    const org = makeOrg();
    const repo = makeMockRepo({ findById: vi.fn().mockResolvedValue(org) });
    const service = new OrganizationService(repo);

    const result = await service.getOrganization("org_1");
    expect(result).toEqual(org);
  });

  it("throws NotFoundError when organization does not exist", async () => {
    const repo = makeMockRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new OrganizationService(repo);

    await expect(service.getOrganization("nonexistent")).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── updateOrganization ───────────────────────────────────────────────────────

describe("OrganizationService.updateOrganization", () => {
  it("updates the organization when it exists", async () => {
    const updated = makeOrg({ name: "Updated Name" });
    const repo = makeMockRepo({
      findById: vi.fn().mockResolvedValue(makeOrg()),
      update: vi.fn().mockResolvedValue(updated),
    });
    const service = new OrganizationService(repo);

    const result = await service.updateOrganization("org_1", { name: "Updated Name" });
    expect(result.name).toBe("Updated Name");
    expect(repo.update).toHaveBeenCalledWith("org_1", { name: "Updated Name" });
  });

  it("throws NotFoundError when organization does not exist", async () => {
    const repo = makeMockRepo({
      findById: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    });
    const service = new OrganizationService(repo);

    await expect(
      service.updateOrganization("nonexistent", { name: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.update).not.toHaveBeenCalled();
  });
});
