/**
 * Unit tests for ProjectService member management methods.
 * Mocks all repositories and AuditService.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProjectService } from "../../src/modules/projects/project.service.js";
import type { ProjectRepository } from "../../src/modules/projects/project.repository.js";
import type { ProjectMemberRepository } from "../../src/modules/projects/project-member.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";
import { ConflictError, ValidationError } from "../../src/common/AppError.js";
import type { Project, ProjectMember } from "@prisma/client";

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

function makeProjectMember(overrides?: Partial<ProjectMember>): ProjectMember {
  return {
    id: "pm_1",
    projectId: "proj_1",
    userId: "user_2",
    orgId: "org_1",
    role: "VIEWER",
    addedById: "user_1",
    createdAt: new Date(),
    ...overrides,
  };
}

function makeMockProjectRepo(overrides?: Partial<Record<keyof ProjectRepository, unknown>>): ProjectRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(makeProject()),
    findByOrg: vi.fn().mockResolvedValue([]),
    countByOrg: vi.fn().mockResolvedValue(0),
    update: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as unknown as ProjectRepository;
}

function makeMockMemberRepo(overrides?: Partial<Record<keyof ProjectMemberRepository, unknown>>): ProjectMemberRepository {
  return {
    addMember: vi.fn().mockResolvedValue(makeProjectMember()),
    removeMember: vi.fn().mockResolvedValue(undefined),
    findByProject: vi.fn().mockResolvedValue([makeProjectMember()]),
    findMembership: vi.fn().mockResolvedValue(null),
    updateRole: vi.fn().mockResolvedValue(makeProjectMember({ role: "PROJECT_MANAGER" })),
    ...overrides,
  } as unknown as ProjectMemberRepository;
}

function makeMockAuditService(): AuditService {
  return {
    log: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;
}

// Mock db for the organization member check
vi.mock("../../src/infrastructure/database/client.js", () => ({
  db: {
    $transaction: vi.fn(),
    organizationMember: {
      findUnique: vi.fn().mockResolvedValue({ orgId: "org_1", userId: "user_2", role: "MEMBER" }),
    },
  },
}));

// ─── addMember ────────────────────────────────────────────────────────────────

describe("ProjectService.addMember", () => {
  let projectRepo: ProjectRepository;
  let memberRepo: ProjectMemberRepository;
  let audit: AuditService;
  let service: ProjectService;

  beforeEach(() => {
    projectRepo = makeMockProjectRepo();
    memberRepo = makeMockMemberRepo();
    audit = makeMockAuditService();
    service = new ProjectService(projectRepo, audit, memberRepo);
  });

  it("calls memberRepo with correct data", async () => {
    const result = await service.addMember("org_1", "proj_1", {
      userId: "user_2",
      role: "VIEWER",
      addedById: "user_1",
    });

    expect(memberRepo.addMember).toHaveBeenCalledWith({
      projectId: "proj_1",
      userId: "user_2",
      orgId: "org_1",
      role: "VIEWER",
      addedById: "user_1",
    });
    expect(result).toBeDefined();
  });

  it("throws ValidationError if user not in org", async () => {
    const { db } = await import("../../src/infrastructure/database/client.js");
    vi.mocked(db.organizationMember.findUnique).mockResolvedValueOnce(null);

    await expect(
      service.addMember("org_1", "proj_1", {
        userId: "outsider",
        role: "VIEWER",
        addedById: "user_1",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(memberRepo.addMember).not.toHaveBeenCalled();
  });

  it("throws ConflictError if already a project member", async () => {
    memberRepo = makeMockMemberRepo({
      findMembership: vi.fn().mockResolvedValue(makeProjectMember()),
    });
    service = new ProjectService(projectRepo, audit, memberRepo);

    await expect(
      service.addMember("org_1", "proj_1", {
        userId: "user_2",
        role: "VIEWER",
        addedById: "user_1",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(memberRepo.addMember).not.toHaveBeenCalled();
  });
});

// ─── removeMember ─────────────────────────────────────────────────────────────

describe("ProjectService.removeMember", () => {
  it("calls memberRepo.removeMember", async () => {
    const projectRepo = makeMockProjectRepo();
    const memberRepo = makeMockMemberRepo();
    const audit = makeMockAuditService();
    const service = new ProjectService(projectRepo, audit, memberRepo);

    await service.removeMember("org_1", "proj_1", "user_2");
    expect(memberRepo.removeMember).toHaveBeenCalledWith("proj_1", "user_2");
  });
});

// ─── listProjectMembers ───────────────────────────────────────────────────────

describe("ProjectService.listProjectMembers", () => {
  it("returns members from repo", async () => {
    const members = [makeProjectMember()];
    const projectRepo = makeMockProjectRepo();
    const memberRepo = makeMockMemberRepo({
      findByProject: vi.fn().mockResolvedValue(members),
    });
    const service = new ProjectService(projectRepo, makeMockAuditService(), memberRepo);

    const result = await service.listProjectMembers("org_1", "proj_1");
    expect(result).toEqual(members);
    expect(memberRepo.findByProject).toHaveBeenCalledWith("proj_1");
  });
});

// ─── updateMemberRole ─────────────────────────────────────────────────────────

describe("ProjectService.updateMemberRole", () => {
  it("updates role and logs audit", async () => {
    const projectRepo = makeMockProjectRepo();
    const memberRepo = makeMockMemberRepo();
    const audit = makeMockAuditService();
    const service = new ProjectService(projectRepo, audit, memberRepo);

    await service.updateMemberRole("org_1", "proj_1", "user_2", "PROJECT_MANAGER");

    expect(memberRepo.updateRole).toHaveBeenCalledWith("proj_1", "user_2", "PROJECT_MANAGER");
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PROJECT_MEMBER_ROLE_CHANGED" }),
    );
  });
});
