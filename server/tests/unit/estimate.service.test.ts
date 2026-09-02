/**
 * Unit tests for EstimateService.
 * Mocks repositories and AuditService — no database required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EstimateService } from "../../src/modules/estimating/estimate.service.js";
import type { EstimateRepository } from "../../src/modules/estimating/estimate.repository.js";
import type { EstimateVersionRepository } from "../../src/modules/estimating/estimate-version.repository.js";
import type { BoqItemRepository } from "../../src/modules/estimating/boq-item.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";
import { NotFoundError, ValidationError } from "../../src/common/AppError.js";
import type { Estimate, EstimateVersion } from "@prisma/client";
import { Prisma } from "@prisma/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEstimate(overrides?: Partial<Estimate>): Estimate {
  return {
    id: "est_1",
    orgId: "org_1",
    estimateNumber: "EST-0001",
    name: "Test Estimate",
    description: null,
    status: "DRAFT",
    version: 1,
    clientName: null,
    clientContact: null,
    siteAddress: null,
    siteCity: null,
    siteCountry: null,
    currency: "USD",
    validUntil: null,
    notes: null,
    scope: null,
    subtotal: new Prisma.Decimal(0),
    overhead: new Prisma.Decimal(0),
    contingency: new Prisma.Decimal(0),
    markup: new Prisma.Decimal(0),
    totalCost: new Prisma.Decimal(0),
    sellingPrice: new Prisma.Decimal(0),
    margin: new Prisma.Decimal(0),
    overheadPercent: new Prisma.Decimal(0),
    contingencyPercent: new Prisma.Decimal(0),
    markupPercent: new Prisma.Decimal(0),
    projectId: null,
    createdById: "user_1",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function makeEstimateVersion(overrides?: Partial<EstimateVersion>): EstimateVersion {
  return {
    id: "ver_1",
    estimateId: "est_1",
    orgId: "org_1",
    version: 1,
    snapshot: {},
    changeNote: null,
    createdById: "user_1",
    createdAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function makeMockRepo(overrides?: Partial<Record<keyof EstimateRepository, unknown>>): EstimateRepository {
  return {
    create: vi.fn().mockResolvedValue(makeEstimate()),
    findById: vi.fn().mockResolvedValue(null),
    findByOrg: vi.fn().mockResolvedValue([]),
    countByOrg: vi.fn().mockResolvedValue(0),
    update: vi.fn().mockResolvedValue(makeEstimate()),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as EstimateRepository;
}

function makeMockVersionRepo(overrides?: Partial<Record<keyof EstimateVersionRepository, unknown>>): EstimateVersionRepository {
  return {
    create: vi.fn().mockResolvedValue(makeEstimateVersion()),
    findByEstimate: vi.fn().mockResolvedValue([]),
    findByVersion: vi.fn().mockResolvedValue(null),
    findLatest: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as EstimateVersionRepository;
}

function makeMockBoqRepo(overrides?: Partial<Record<keyof BoqItemRepository, unknown>>): BoqItemRepository {
  return {
    create: vi.fn().mockResolvedValue({}),
    createMany: vi.fn().mockResolvedValue({}),
    findByEstimate: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    deleteByEstimate: vi.fn().mockResolvedValue({}),
    countByEstimate: vi.fn().mockResolvedValue(0),
    reorder: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as BoqItemRepository;
}

function makeMockAuditService(): AuditService {
  return {
    log: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;
}

// Mock db.$transaction used in convertToProject
vi.mock("../../src/infrastructure/database/client.js", () => ({
  db: {
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        project: {
          create: vi.fn().mockResolvedValue({ id: "proj_1", name: "Test Project" }),
        },
        projectSettings: {
          create: vi.fn().mockResolvedValue({ id: "settings_1" }),
        },
        estimate: {
          update: vi.fn().mockResolvedValue(makeEstimate({ status: "CONVERTED", projectId: "proj_1" })),
        },
      };
      return fn(mockTx);
    }),
  },
}));

// ─── createEstimate ────────────────────────────────────────────────────────────

describe("EstimateService.createEstimate", () => {
  let repo: EstimateRepository;
  let versionRepo: EstimateVersionRepository;
  let boqRepo: BoqItemRepository;
  let audit: AuditService;
  let service: EstimateService;

  beforeEach(() => {
    repo = makeMockRepo({ countByOrg: vi.fn().mockResolvedValue(0) });
    versionRepo = makeMockVersionRepo();
    boqRepo = makeMockBoqRepo();
    audit = makeMockAuditService();
    service = new EstimateService(repo, versionRepo, boqRepo, audit);
  });

  it("generates EST-0001 when org has 0 existing estimates", async () => {
    await service.createEstimate("org_1", "user_1", { name: "My Estimate" });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ estimateNumber: "EST-0001" }),
    );
  });

  it("generates EST-0002 when org already has 1 estimate", async () => {
    repo = makeMockRepo({ countByOrg: vi.fn().mockResolvedValue(1) });
    service = new EstimateService(repo, versionRepo, boqRepo, audit);
    await service.createEstimate("org_1", "user_1", { name: "Second" });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ estimateNumber: "EST-0002" }),
    );
  });

  it("throws ValidationError for empty name", async () => {
    await expect(
      service.createEstimate("org_1", "user_1", { name: "" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("calls auditService.log with ESTIMATE_CREATED action", async () => {
    repo = makeMockRepo({
      countByOrg: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(makeEstimate()),
    });
    service = new EstimateService(repo, versionRepo, boqRepo, audit);
    await service.createEstimate("org_1", "user_1", { name: "Audit Test" });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ESTIMATE_CREATED" }),
    );
  });
});

// ─── getEstimate ──────────────────────────────────────────────────────────────

describe("EstimateService.getEstimate", () => {
  it("throws NotFoundError when estimate not found", async () => {
    const repo = makeMockRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new EstimateService(
      repo,
      makeMockVersionRepo(),
      makeMockBoqRepo(),
      makeMockAuditService(),
    );
    await expect(service.getEstimate("org_1", "nonexistent")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns estimate when found", async () => {
    const estimate = makeEstimate();
    const repo = makeMockRepo({ findById: vi.fn().mockResolvedValue(estimate) });
    const service = new EstimateService(
      repo,
      makeMockVersionRepo(),
      makeMockBoqRepo(),
      makeMockAuditService(),
    );
    const result = await service.getEstimate("org_1", "est_1");
    expect(result).toEqual(estimate);
  });
});

// ─── updateEstimate ───────────────────────────────────────────────────────────

describe("EstimateService.updateEstimate", () => {
  it("throws ValidationError when status is APPROVED", async () => {
    const repo = makeMockRepo({
      findById: vi.fn().mockResolvedValue(makeEstimate({ status: "APPROVED" })),
    });
    const service = new EstimateService(
      repo,
      makeMockVersionRepo(),
      makeMockBoqRepo(),
      makeMockAuditService(),
    );
    await expect(
      service.updateEstimate("org_1", "est_1", "user_1", { name: "New Name" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError when status is CONVERTED", async () => {
    const repo = makeMockRepo({
      findById: vi.fn().mockResolvedValue(makeEstimate({ status: "CONVERTED" })),
    });
    const service = new EstimateService(
      repo,
      makeMockVersionRepo(),
      makeMockBoqRepo(),
      makeMockAuditService(),
    );
    await expect(
      service.updateEstimate("org_1", "est_1", "user_1", { name: "New Name" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("succeeds when status is DRAFT", async () => {
    const repo = makeMockRepo({
      findById: vi.fn().mockResolvedValue(makeEstimate({ status: "DRAFT" })),
      update: vi.fn().mockResolvedValue(makeEstimate({ name: "Updated" })),
    });
    const audit = makeMockAuditService();
    const service = new EstimateService(
      repo,
      makeMockVersionRepo(),
      makeMockBoqRepo(),
      audit,
    );
    const result = await service.updateEstimate("org_1", "est_1", "user_1", { name: "Updated" });
    expect(result.name).toBe("Updated");
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ESTIMATE_UPDATED" }),
    );
  });
});

// ─── transitionStatus ─────────────────────────────────────────────────────────

describe("EstimateService.transitionStatus", () => {
  it("DRAFT → UNDER_REVIEW succeeds", async () => {
    const estimate = makeEstimate({ status: "DRAFT" });
    const repo = makeMockRepo({
      findById: vi.fn().mockResolvedValue(estimate),
      update: vi.fn().mockResolvedValue(makeEstimate({ status: "UNDER_REVIEW" })),
    });
    const versionRepo = makeMockVersionRepo();
    const boqRepo = makeMockBoqRepo();
    const service = new EstimateService(repo, versionRepo, boqRepo, makeMockAuditService());

    const result = await service.transitionStatus("org_1", "est_1", "UNDER_REVIEW", "user_1");
    expect(result.status).toBe("UNDER_REVIEW");
  });

  it("DRAFT → CONVERTED throws ValidationError (invalid transition)", async () => {
    const repo = makeMockRepo({
      findById: vi.fn().mockResolvedValue(makeEstimate({ status: "DRAFT" })),
    });
    const service = new EstimateService(
      repo,
      makeMockVersionRepo(),
      makeMockBoqRepo(),
      makeMockAuditService(),
    );
    await expect(
      service.transitionStatus("org_1", "est_1", "CONVERTED", "user_1"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("CONVERTED → DRAFT throws ValidationError (no transitions from CONVERTED)", async () => {
    const repo = makeMockRepo({
      findById: vi.fn().mockResolvedValue(makeEstimate({ status: "CONVERTED" })),
    });
    const service = new EstimateService(
      repo,
      makeMockVersionRepo(),
      makeMockBoqRepo(),
      makeMockAuditService(),
    );
    await expect(
      service.transitionStatus("org_1", "est_1", "DRAFT", "user_1"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("DRAFT → UNDER_REVIEW calls createVersion before transition", async () => {
    const estimate = makeEstimate({ status: "DRAFT" });
    const repo = makeMockRepo({
      findById: vi.fn().mockResolvedValue(estimate),
      update: vi.fn().mockResolvedValue(makeEstimate({ status: "UNDER_REVIEW" })),
    });
    const versionRepo = makeMockVersionRepo();
    const boqRepo = makeMockBoqRepo();
    const audit = makeMockAuditService();
    const service = new EstimateService(repo, versionRepo, boqRepo, audit);

    await service.transitionStatus("org_1", "est_1", "UNDER_REVIEW", "user_1");
    // createVersion calls versionRepo.create
    expect(versionRepo.create).toHaveBeenCalled();
  });
});
