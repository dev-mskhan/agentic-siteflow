import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Project, Subcontractor, SubcontractorContract, Task } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../src/common/index.js";
import { SubcontractorService } from "../../src/modules/subcontractors/subcontractor.service.js";
import type { SubcontractorRepository } from "../../src/modules/subcontractors/subcontractor.repository.js";
import type { SubcontractorContractRepository } from "../../src/modules/subcontractors/subcontractor-contract.repository.js";
import type { ProjectRepository } from "../../src/modules/projects/project.repository.js";
import type { TaskRepository } from "../../src/modules/scheduling/task.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";

function makeSubcontractor(overrides: Partial<Subcontractor> = {}): Subcontractor {
  return {
    id: "sub_1",
    orgId: "org_1",
    companyName: "Apex Plumbing",
    trade: "Plumbing",
    contactName: "John Doe",
    contactEmail: "john@apex.com",
    contactPhone: "555-1234",
    address: "123 Pipe St",
    taxId: "TAX-123",
    status: "ACTIVE",
    licenseNumber: "LIC-999",
    licenseExpiry: new Date(Date.now() + 86400000 * 365),
    insurancePolicyNumber: "INS-888",
    insuranceExpiry: new Date(Date.now() + 86400000 * 365),
    isCompliant: true,
    rating: null,
    notes: null,
    createdById: "user_1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeContract(overrides: Partial<SubcontractorContract> = {}): SubcontractorContract {
  return {
    id: "sc_contract_1",
    orgId: "org_1",
    projectId: "proj_1",
    subcontractorId: "sub_1",
    contractNumber: "SC-0001",
    scopeOfWork: "All rough-in plumbing",
    contractValue: new Prisma.Decimal(50000),
    retainagePercent: new Prisma.Decimal(0.1),
    startDate: new Date(),
    endDate: new Date(Date.now() + 86400000 * 30),
    status: "DRAFT",
    costCodeId: null,
    createdById: "user_1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj_1",
    orgId: "org_1",
    name: "Office Tower",
    description: null,
    projectNumber: "PRJ-0001",
    status: "ACTIVE",
    projectType: "commercial",
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task_1",
    projectId: "proj_1",
    orgId: "org_1",
    phaseId: null,
    costCodeId: null,
    assigneeId: null,
    subcontractorId: null,
    name: "Rough-in pipe install",
    description: null,
    status: "TODO",
    priority: "MEDIUM",
    plannedStartDate: null,
    plannedEndDate: null,
    actualStartDate: null,
    actualEndDate: null,
    durationDays: 5,
    progress: 0,
    notes: null,
    createdById: "user_1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("SubcontractorService", () => {
  let service: SubcontractorService;
  let mockSubRepo: {
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findByOrg: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    countByOrg: ReturnType<typeof vi.fn>;
  };
  let mockContractRepo: {
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findByProject: ReturnType<typeof vi.fn>;
    findBySubcontractor: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    countByOrg: ReturnType<typeof vi.fn>;
  };
  let mockProjectRepo: {
    findById: ReturnType<typeof vi.fn>;
  };
  let mockTaskRepo: {
    findById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let mockAuditService: {
    log: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockSubRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByOrg: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      countByOrg: vi.fn(),
    };

    mockContractRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByProject: vi.fn(),
      findBySubcontractor: vi.fn(),
      update: vi.fn(),
      countByOrg: vi.fn(),
    };

    mockProjectRepo = {
      findById: vi.fn(),
    };

    mockTaskRepo = {
      findById: vi.fn(),
      update: vi.fn(),
    };

    mockAuditService = {
      log: vi.fn(),
    };

    service = new SubcontractorService(
      mockSubRepo as unknown as SubcontractorRepository,
      mockContractRepo as unknown as SubcontractorContractRepository,
      mockProjectRepo as unknown as ProjectRepository,
      mockTaskRepo as unknown as TaskRepository,
      mockAuditService as unknown as AuditService,
    );
  });

  describe("createSubcontractor", () => {
    it("creates compliant subcontractor when insurance and license are in the future", async () => {
      const created = makeSubcontractor();
      mockSubRepo.create.mockResolvedValue(created);

      const result = await service.createSubcontractor("org_1", "user_1", {
        companyName: "Apex Plumbing",
        trade: "Plumbing",
        licenseExpiry: new Date(Date.now() + 86400000 * 100),
        insuranceExpiry: new Date(Date.now() + 86400000 * 200),
      });

      expect(mockSubRepo.create).toHaveBeenCalledWith(
        "org_1",
        "user_1",
        expect.anything(),
        true,
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SUBCONTRACTOR_CREATED",
          entityId: created.id,
        }),
      );
      expect(result).toEqual(created);
    });

    it("auto-computes isCompliant=false if insurance is expired", async () => {
      const created = makeSubcontractor({ isCompliant: false });
      mockSubRepo.create.mockResolvedValue(created);

      await service.createSubcontractor("org_1", "user_1", {
        companyName: "Apex Plumbing",
        trade: "Plumbing",
        insuranceExpiry: new Date(Date.now() - 86400000), // yesterday
      });

      expect(mockSubRepo.create).toHaveBeenCalledWith(
        "org_1",
        "user_1",
        expect.anything(),
        false,
      );
    });

    it("throws ValidationError for empty companyName or trade", async () => {
      await expect(
        service.createSubcontractor("org_1", "user_1", {
          companyName: "",
          trade: "Plumbing",
        }),
      ).rejects.toThrow(ValidationError);

      await expect(
        service.createSubcontractor("org_1", "user_1", {
          companyName: "Apex Plumbing",
          trade: "   ",
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("createContract", () => {
    it("creates contract and generates sequential contractNumber", async () => {
      mockProjectRepo.findById.mockResolvedValue(makeProject());
      mockSubRepo.findById.mockResolvedValue(makeSubcontractor());
      mockContractRepo.countByOrg.mockResolvedValue(0);
      const created = makeContract();
      mockContractRepo.create.mockResolvedValue(created);

      const result = await service.createContract("org_1", "proj_1", "user_1", {
        projectId: "proj_1",
        subcontractorId: "sub_1",
        scopeOfWork: "All rough-in plumbing",
        contractValue: 50000,
      });

      expect(mockContractRepo.create).toHaveBeenCalledWith(
        "org_1",
        "user_1",
        "SC-0001",
        expect.objectContaining({
          subcontractorId: "sub_1",
          contractValue: 50000,
        }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SUBCONTRACTOR_CONTRACT_CREATED",
          entityId: created.id,
        }),
      );
      expect(result).toEqual(created);
    });

    it("throws ValidationError for COMPLETED or CANCELLED project", async () => {
      mockProjectRepo.findById.mockResolvedValue(makeProject({ status: "COMPLETED" }));

      await expect(
        service.createContract("org_1", "proj_1", "user_1", {
          projectId: "proj_1",
          subcontractorId: "sub_1",
          scopeOfWork: "All rough-in plumbing",
          contractValue: 50000,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError for negative contract value", async () => {
      mockProjectRepo.findById.mockResolvedValue(makeProject());
      mockSubRepo.findById.mockResolvedValue(makeSubcontractor());

      await expect(
        service.createContract("org_1", "proj_1", "user_1", {
          projectId: "proj_1",
          subcontractorId: "sub_1",
          scopeOfWork: "All rough-in plumbing",
          contractValue: -100,
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("updateContractStatus", () => {
    it("transitions DRAFT to ACTIVE and emits SubcontractorAssigned domain event", async () => {
      const contract = makeContract({ status: "DRAFT" });
      mockContractRepo.findById.mockResolvedValue(contract);
      mockContractRepo.update.mockResolvedValue({ ...contract, status: "ACTIVE" });

      const result = await service.updateContractStatus("org_1", "sc_contract_1", "ACTIVE", "user_1");

      expect(mockContractRepo.update).toHaveBeenCalledWith("org_1", "sc_contract_1", {
        status: "ACTIVE",
      });
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SUBCONTRACTOR_CONTRACT_STATUS_CHANGED",
        }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SubcontractorAssigned",
          entity: "domain_event",
        }),
      );
      expect(result.status).toBe("ACTIVE");
    });

    it("throws ValidationError for invalid status transition", async () => {
      const contract = makeContract({ status: "DRAFT" });
      mockContractRepo.findById.mockResolvedValue(contract);

      await expect(
        service.updateContractStatus("org_1", "sc_contract_1", "COMPLETED", "user_1"),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("assignTaskSubcontractor", () => {
    it("assigns subcontractor to task and records audit", async () => {
      mockTaskRepo.findById.mockResolvedValue(makeTask());
      mockSubRepo.findById.mockResolvedValue(makeSubcontractor());

      await service.assignTaskSubcontractor("org_1", "task_1", "sub_1", "user_1");

      expect(mockTaskRepo.update).toHaveBeenCalledWith("org_1", "task_1", {
        subcontractorId: "sub_1",
      });
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SUBCONTRACTOR_ASSIGNED_TASK",
          entity: "task",
          entityId: "task_1",
        }),
      );
    });

    it("throws NotFoundError if task not found in org", async () => {
      mockTaskRepo.findById.mockResolvedValue(null);

      await expect(
        service.assignTaskSubcontractor("org_1", "task_1", "sub_1", "user_1"),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
