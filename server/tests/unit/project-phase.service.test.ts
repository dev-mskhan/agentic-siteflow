/**
 * Unit tests for ProjectService phase management methods.
 */

import { describe, it, expect, vi } from "vitest";
import { ProjectService } from "../../src/modules/projects/project.service.js";
import type { ProjectRepository } from "../../src/modules/projects/project.repository.js";
import type { ProjectPhaseRepository } from "../../src/modules/projects/project-phase.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";
import type { Project, ProjectPhase } from "@prisma/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProject(overrides?: Partial<Project>): Project {
  return {
    id: "proj_1",
    orgId: "org_1",
    name: "Test Project",
    description: null,
    projectNumber: "PRJ-0001",
    status: "ACTIVE",
    projectType: null,
    currency: "USD",
    clientName: null,
    clientContact: null,
    siteAddress: null,
    siteCity: null,
    siteCountry: null,
    contractValue: null,
    contractDate: null,
    plannedStartDate: null,
    plannedEndDate: null,
    actualStartDate: null,
    actualEndDate: null,
    budget: null,
    settings: {},
    createdById: "user_1",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function makePhase(overrides?: Partial<ProjectPhase>): ProjectPhase {
  return {
    id: "phase_1",
    projectId: "proj_1",
    orgId: "org_1",
    name: "Foundation",
    description: null,
    color: null,
    order: 0,
    plannedStartDate: null,
    plannedEndDate: null,
    actualStartDate: null,
    actualEndDate: null,
    status: "ACTIVE",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function makeMockProjectRepo(): ProjectRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(makeProject()),
    findByOrg: vi.fn().mockResolvedValue([]),
    countByOrg: vi.fn().mockResolvedValue(0),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as ProjectRepository;
}

function makeMockPhaseRepo(overrides?: Partial<Record<keyof ProjectPhaseRepository, unknown>>): ProjectPhaseRepository {
  return {
    create: vi.fn().mockResolvedValue(makePhase()),
    findByProject: vi.fn().mockResolvedValue([makePhase({ order: 0 }), makePhase({ id: "phase_2", order: 1 })]),
    findById: vi.fn().mockResolvedValue(makePhase()),
    update: vi.fn().mockResolvedValue(makePhase()),
    delete: vi.fn().mockResolvedValue(undefined),
    countByProject: vi.fn().mockResolvedValue(0),
    reorder: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as ProjectPhaseRepository;
}

function makeMockAuditService(): AuditService {
  return { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
}

vi.mock("../../src/infrastructure/database/client.js", () => ({
  db: {
    $transaction: vi.fn(),
    organizationMember: { findUnique: vi.fn() },
  },
}));

// ─── createPhase ──────────────────────────────────────────────────────────────

describe("ProjectService.createPhase", () => {
  it("assigns order 0 to the first phase", async () => {
    const phaseRepo = makeMockPhaseRepo({
      countByProject: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(makePhase({ order: 0 })),
    });
    const service = new ProjectService(makeMockProjectRepo(), makeMockAuditService(), undefined, undefined, phaseRepo);

    await service.createPhase("org_1", "proj_1", "user_1", { name: "Phase 1" });

    expect(phaseRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ order: 0 }),
    );
  });

  it("assigns order 1 to the second phase", async () => {
    const phaseRepo = makeMockPhaseRepo({
      countByProject: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockResolvedValue(makePhase({ order: 1 })),
    });
    const service = new ProjectService(makeMockProjectRepo(), makeMockAuditService(), undefined, undefined, phaseRepo);

    await service.createPhase("org_1", "proj_1", "user_1", { name: "Phase 2" });

    expect(phaseRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ order: 1 }),
    );
  });
});

// ─── listPhases ───────────────────────────────────────────────────────────────

describe("ProjectService.listPhases", () => {
  it("returns phases ordered by order asc", async () => {
    const phase1 = makePhase({ id: "phase_1", order: 0 });
    const phase2 = makePhase({ id: "phase_2", order: 1 });
    const phaseRepo = makeMockPhaseRepo({
      findByProject: vi.fn().mockResolvedValue([phase1, phase2]),
    });
    const service = new ProjectService(makeMockProjectRepo(), makeMockAuditService(), undefined, undefined, phaseRepo);

    const result = await service.listPhases("org_1", "proj_1");
    expect(result[0]!.order).toBeLessThanOrEqual(result[1]!.order);
  });
});

// ─── reorderPhases ────────────────────────────────────────────────────────────

describe("ProjectService.reorderPhases", () => {
  it("updates all order values in transaction", async () => {
    const phases = [
      makePhase({ id: "phase_1", order: 0 }),
      makePhase({ id: "phase_2", order: 1 }),
    ];
    const phaseRepo = makeMockPhaseRepo({
      findByProject: vi.fn().mockResolvedValue(phases),
      reorder: vi.fn().mockResolvedValue([]),
    });
    const service = new ProjectService(makeMockProjectRepo(), makeMockAuditService(), undefined, undefined, phaseRepo);

    await service.reorderPhases("org_1", "proj_1", ["phase_2", "phase_1"], "user_1");

    expect(phaseRepo.reorder).toHaveBeenCalledWith("proj_1", ["phase_2", "phase_1"]);
  });
});
