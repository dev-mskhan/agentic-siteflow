import { describe, expect, it, vi } from "vitest";
import type { Milestone, Project } from "@prisma/client";
import { ValidationError } from "../../src/common/index.js";
import { MilestoneService } from "../../src/modules/scheduling/milestone.service.js";
import type { MilestoneRepository } from "../../src/modules/scheduling/milestone.repository.js";
import type { ProjectRepository } from "../../src/modules/projects/project.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";

const project = { id: "project_1", orgId: "org_1", status: "ACTIVE" } as Project;
const milestone = (overrides: Partial<Milestone> = {}) => ({
  id: "milestone_1",
  projectId: "project_1",
  orgId: "org_1",
  name: "Inspection",
  description: null,
  dueDate: new Date(Date.now() + 86_400_000),
  status: "PENDING",
  linkedTaskId: null,
  createdById: "user_1",
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
}) as Milestone;

function setup(items: Milestone[] = [milestone()]) {
  const repo = {
    create: vi.fn().mockResolvedValue(items[0]),
    findByProject: vi.fn().mockResolvedValue(items),
    findById: vi.fn().mockResolvedValue(items[0]),
    update: vi.fn().mockImplementation((_org: string, _id: string, data: Partial<Milestone>) =>
      Promise.resolve(milestone(data)),
    ),
    delete: vi.fn().mockResolvedValue(items[0]),
  } as unknown as MilestoneRepository;
  const projects = { findById: vi.fn().mockResolvedValue(project) } as unknown as ProjectRepository;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { service: new MilestoneService(repo, projects, {} as never, audit), repo, audit };
}

describe("MilestoneService", () => {
  it("rejects a due date in the past", async () => {
    const { service } = setup();
    await expect(service.createMilestone("org_1", "project_1", "user_1", {
      name: "Inspection",
      dueDate: new Date(Date.now() - 1),
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns pending milestones past their due date", async () => {
    const item = milestone({ dueDate: new Date(Date.now() - 86_400_000) });
    const { service, repo } = setup([item]);
    await expect(service.checkMissedMilestones("org_1", "project_1")).resolves.toEqual([item]);
    expect(repo.findByProject).toHaveBeenCalledWith("org_1", "project_1", expect.objectContaining({
      status: "PENDING",
    }));
  });
});
