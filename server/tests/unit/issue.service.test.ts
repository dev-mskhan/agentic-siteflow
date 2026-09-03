import { describe, expect, it, vi } from "vitest";
import type { Issue, Project } from "@prisma/client";
import { ValidationError } from "../../src/common/index.js";
import { IssueService } from "../../src/modules/field-ops/issue.service.js";
import type { IssueRepository } from "../../src/modules/field-ops/issue.repository.js";
import type { ProjectRepository } from "../../src/modules/projects/project.repository.js";
import type { TaskRepository } from "../../src/modules/scheduling/task.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";

const issue = (overrides: Partial<Issue> = {}) => ({
  id: "issue_1", projectId: "project_1", orgId: "org_1", title: "Blocked delivery",
  description: "Material has not arrived", category: "Procurement", priority: "HIGH",
  status: "OPEN", responsiblePartyId: null, dueDate: null, hasProjectImpact: false,
  projectImpactDescription: null, hasCostImpact: false, costImpactAmount: null,
  hasScheduleImpact: false, scheduleImpactDays: null, resolution: null, resolvedAt: null,
  linkedTaskId: null, createdById: "user_1", createdAt: new Date(), updatedAt: new Date(),
  ...overrides,
}) as Issue;

function setup(current = issue()) {
  const repo = {
    create: vi.fn().mockResolvedValue(current),
    findById: vi.fn().mockResolvedValue(current),
    findByProject: vi.fn().mockResolvedValue([current]),
    update: vi.fn().mockImplementation((_org: string, _id: string, data: Partial<Issue>) =>
      Promise.resolve(issue(data)),
    ),
  } as unknown as IssueRepository;
  const projects = { findById: vi.fn().mockResolvedValue({ id: "project_1", orgId: "org_1", status: "ACTIVE" } as Project) } as unknown as ProjectRepository;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { service: new IssueService(repo, projects, {} as TaskRepository, audit), repo, audit };
}

describe("IssueService", () => {
  it("audits issue creation and publishes IssueCreated", async () => {
    const { service, audit } = setup();
    await service.createIssue("org_1", "project_1", "user_1", {
      title: "Blocked delivery", description: "Material has not arrived",
    });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "ISSUE_CREATED" }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "IssueCreated", entity: "domain_event" }));
  });

  it("resolves issues once and records the resolution timestamp", async () => {
    const { service, audit } = setup();
    const result = await service.resolveIssue("org_1", "issue_1", "user_1", "Delivery rescheduled");
    expect(result.resolvedAt).toBeInstanceOf(Date);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "IssueResolved", entity: "domain_event" }));
    const resolved = setup(issue({ status: "RESOLVED" }));
    await expect(resolved.service.resolveIssue("org_1", "issue_1", "user_1", "Again")).rejects.toBeInstanceOf(ValidationError);
  });

  it("passes status and tenant filters to issue listing", async () => {
    const { service, repo } = setup();
    await service.listIssues("org_1", "project_1", { status: "OPEN" });
    expect(repo.findByProject).toHaveBeenCalledWith("org_1", "project_1", { status: "OPEN" });
  });
});
