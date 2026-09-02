/**
 * Unit tests for ProjectService lifecycle / status transition methods.
 */

import { describe, it, expect, vi } from "vitest";
import { ProjectService } from "../../src/modules/projects/project.service.js";
import type { ProjectRepository } from "../../src/modules/projects/project.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";
import { ValidationError } from "../../src/common/AppError.js";
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

function makeMockRepo(projectStatus: Project["status"]): ProjectRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(makeProject({ status: projectStatus })),
    findByOrg: vi.fn().mockResolvedValue([]),
    countByOrg: vi.fn().mockResolvedValue(0),
    update: vi.fn().mockImplementation(
      (_orgId: string, _projectId: string, data: { status?: Project["status"] }) =>
        Promise.resolve(makeProject({ status: data.status ?? projectStatus })),
    ),
    delete: vi.fn(),
  } as unknown as ProjectRepository;
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

// ─── Status Transitions ────────────────────────────────────────────────────────

describe("ProjectService.transitionStatus", () => {
  it("DRAFT → ACTIVE succeeds", async () => {
    const repo = makeMockRepo("DRAFT");
    const audit = makeMockAuditService();
    const service = new ProjectService(repo, audit);

    const result = await service.transitionStatus("org_1", "proj_1", "ACTIVE", "user_1");
    expect(result.status).toBe("ACTIVE");
    expect(vi.mocked(audit.log)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PROJECT_STATUS_CHANGED" }),
    );
  });

  it("DRAFT → COMPLETED throws ValidationError", async () => {
    const repo = makeMockRepo("DRAFT");
    const service = new ProjectService(repo, makeMockAuditService());

    await expect(
      service.transitionStatus("org_1", "proj_1", "COMPLETED", "user_1"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("ACTIVE → ON_HOLD succeeds", async () => {
    const repo = makeMockRepo("ACTIVE");
    const service = new ProjectService(repo, makeMockAuditService());

    const result = await service.transitionStatus("org_1", "proj_1", "ON_HOLD", "user_1");
    expect(result.status).toBe("ON_HOLD");
  });

  it("COMPLETED → ACTIVE throws ValidationError", async () => {
    const repo = makeMockRepo("COMPLETED");
    const service = new ProjectService(repo, makeMockAuditService());

    await expect(
      service.transitionStatus("org_1", "proj_1", "ACTIVE", "user_1"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("CANCELLED → anything throws ValidationError", async () => {
    const repo = makeMockRepo("CANCELLED");
    const service = new ProjectService(repo, makeMockAuditService());

    await expect(
      service.transitionStatus("org_1", "proj_1", "ACTIVE", "user_1"),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      service.transitionStatus("org_1", "proj_1", "DRAFT", "user_1"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("logs audit with PROJECT_STATUS_CHANGED", async () => {
    const repo = makeMockRepo("DRAFT");
    const audit = makeMockAuditService();
    const service = new ProjectService(repo, audit);

    await service.transitionStatus("org_1", "proj_1", "ACTIVE", "user_1", "Starting now");

    expect(vi.mocked(audit.log)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PROJECT_STATUS_CHANGED",
        oldValue: { status: "DRAFT" },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        newValue: expect.objectContaining({ status: "ACTIVE", reason: "Starting now" }),
      }),
    );
  });
});
