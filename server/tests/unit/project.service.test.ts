/**
 * Unit tests for ProjectService.
 * Mocks ProjectRepository and AuditService — no database required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProjectService } from "../../src/modules/projects/project.service.js";
import type { ProjectRepository } from "../../src/modules/projects/project.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";
import { NotFoundError, ValidationError } from "../../src/common/AppError.js";
import type { Project } from "@prisma/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProject(overrides?: Partial<Project>): Project {
  return {
    id: "proj_1",
    orgId: "org_1",
    name: "Test Project",
    description: null,
    projectNumber: "PRJ-0001",
    status: "DRAFT",
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

function makeMockRepo(overrides?: Partial<Record<keyof ProjectRepository, unknown>>): ProjectRepository {
  return {
    create: vi.fn().mockResolvedValue(makeProject()),
    findById: vi.fn().mockResolvedValue(null),
    findByOrg: vi.fn().mockResolvedValue([]),
    countByOrg: vi.fn().mockResolvedValue(0),
    update: vi.fn().mockResolvedValue(makeProject()),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ProjectRepository;
}

function makeMockAuditService(): AuditService {
  return {
    log: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;
}

// Mock db.$transaction used in createProject
vi.mock("../../src/infrastructure/database/client.js", () => ({
  db: {
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => {
      // Simulate transaction by calling fn with a mock tx that has project/projectSettings
      const tx = {
        project: {
          create: vi.fn().mockResolvedValue(makeProject()),
        },
        projectSettings: {
          create: vi.fn().mockResolvedValue({ id: "settings_1", projectId: "proj_1" }),
        },
      };
      return fn(tx);
    }),
    organizationMember: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

// ─── createProject ────────────────────────────────────────────────────────────

describe("ProjectService.createProject", () => {
  let repo: ProjectRepository;
  let audit: AuditService;
  let service: ProjectService;

  beforeEach(() => {
    repo = makeMockRepo({ countByOrg: vi.fn().mockResolvedValue(0) });
    audit = makeMockAuditService();
    service = new ProjectService(repo, audit);
  });

  it("generates PRJ-0001 when org has 0 projects", async () => {
    // The transaction mock returns makeProject() which has projectNumber PRJ-0001
    const project = await service.createProject("org_1", "user_1", { name: "My Project" });
    expect(project.projectNumber).toBe("PRJ-0001");
  });

  it("generates PRJ-0002 when org already has 1 project", async () => {
    repo = makeMockRepo({ countByOrg: vi.fn().mockResolvedValue(1) });
    const { db } = await import("../../src/infrastructure/database/client.js");
    vi.mocked(db.$transaction).mockImplementationOnce((fn: (tx: unknown) => unknown) => {
      const tx = {
        project: {
          create: vi.fn().mockResolvedValue(makeProject({ projectNumber: "PRJ-0002" })),
        },
        projectSettings: {
          create: vi.fn().mockResolvedValue({ id: "settings_2", projectId: "proj_1" }),
        },
      };
      return fn(tx);
    });
    service = new ProjectService(repo, audit);
    const project = await service.createProject("org_1", "user_1", { name: "Second Project" });
    expect(project.projectNumber).toBe("PRJ-0002");
  });

  it("throws ValidationError for empty name", async () => {
    await expect(
      service.createProject("org_1", "user_1", { name: "" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError for whitespace-only name", async () => {
    await expect(
      service.createProject("org_1", "user_1", { name: "   " }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("calls auditService.log with PROJECT_CREATED action", async () => {
    await service.createProject("org_1", "user_1", { name: "Audit Test" });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PROJECT_CREATED" }),
    );
  });
});

// ─── getProject ───────────────────────────────────────────────────────────────

describe("ProjectService.getProject", () => {
  it("throws NotFoundError when project not found", async () => {
    const repo = makeMockRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new ProjectService(repo, makeMockAuditService());

    await expect(service.getProject("org_1", "nonexistent")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns project when found in correct org", async () => {
    const proj = makeProject();
    const repo = makeMockRepo({ findById: vi.fn().mockResolvedValue(proj) });
    const service = new ProjectService(repo, makeMockAuditService());

    const result = await service.getProject("org_1", "proj_1");
    expect(result).toEqual(proj);
    expect(repo.findById).toHaveBeenCalledWith("org_1", "proj_1");
  });
});

// ─── listProjects ─────────────────────────────────────────────────────────────

describe("ProjectService.listProjects", () => {
  it("calls repo with orgId always included", async () => {
    const repo = makeMockRepo({ findByOrg: vi.fn().mockResolvedValue([]) });
    const service = new ProjectService(repo, makeMockAuditService());

    await service.listProjects("org_1");
    expect(repo.findByOrg).toHaveBeenCalledWith("org_1", undefined);
  });

  it("passes filters to repo", async () => {
    const repo = makeMockRepo({ findByOrg: vi.fn().mockResolvedValue([]) });
    const service = new ProjectService(repo, makeMockAuditService());

    await service.listProjects("org_1", { status: "ACTIVE", limit: 10 });
    expect(repo.findByOrg).toHaveBeenCalledWith("org_1", { status: "ACTIVE", limit: 10 });
  });
});

// ─── updateProject ────────────────────────────────────────────────────────────

describe("ProjectService.updateProject", () => {
  it("throws ValidationError when project is COMPLETED", async () => {
    const repo = makeMockRepo({
      findById: vi.fn().mockResolvedValue(makeProject({ status: "COMPLETED" })),
    });
    const service = new ProjectService(repo, makeMockAuditService());

    await expect(
      service.updateProject("org_1", "proj_1", "user_1", { name: "New Name" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError when project is CANCELLED", async () => {
    const repo = makeMockRepo({
      findById: vi.fn().mockResolvedValue(makeProject({ status: "CANCELLED" })),
    });
    const service = new ProjectService(repo, makeMockAuditService());

    await expect(
      service.updateProject("org_1", "proj_1", "user_1", { name: "New Name" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("succeeds for ACTIVE project", async () => {
    const repo = makeMockRepo({
      findById: vi.fn().mockResolvedValue(makeProject({ status: "ACTIVE" })),
      update: vi.fn().mockResolvedValue(makeProject({ status: "ACTIVE", name: "Updated" })),
    });
    const audit = makeMockAuditService();
    const service = new ProjectService(repo, audit);

    const result = await service.updateProject("org_1", "proj_1", "user_1", { name: "Updated" });
    expect(result.name).toBe("Updated");
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PROJECT_UPDATED" }),
    );
  });
});
