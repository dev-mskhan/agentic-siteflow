import type {
  Subcontractor,
  SubcontractorContract,
  SubcontractorContractStatus,
} from "@prisma/client";
import { NotFoundError, ValidationError } from "../../common/AppError.js";
import type { AuditService } from "../audit/audit.service.js";
import { auditService as defaultAuditService } from "../audit/audit.router.js";
import { projectRepository as defaultProjectRepository, type ProjectRepository } from "../projects/project.repository.js";
import { taskRepository as defaultTaskRepository, type TaskRepository } from "../scheduling/task.repository.js";
import {
  subcontractorRepository as defaultSubcontractorRepository,
  type SubcontractorRepository,
} from "./subcontractor.repository.js";
import {
  subcontractorContractRepository as defaultContractRepository,
  type SubcontractorContractRepository,
} from "./subcontractor-contract.repository.js";
import {
  SUBCONTRACTOR_AUDIT_ACTIONS,
  SUBCONTRACTOR_CONTRACT_STATUS_TRANSITIONS,
  SUBCONTRACTOR_DOMAIN_EVENTS,
  type CreateSubcontractorContractInput,
  type CreateSubcontractorInput,
  type SubcontractorFilters,
  type UpdateSubcontractorInput,
} from "./subcontractor.types.js";

export class SubcontractorService {
  constructor(
    private readonly subRepo: SubcontractorRepository = defaultSubcontractorRepository,
    private readonly contractRepo: SubcontractorContractRepository = defaultContractRepository,
    private readonly projectRepo: ProjectRepository = defaultProjectRepository,
    private readonly taskRepo: TaskRepository = defaultTaskRepository,
    private readonly audit: AuditService = defaultAuditService,
  ) {}

  private checkCompliance(licenseExpiry?: Date | null, insuranceExpiry?: Date | null): boolean {
    const now = new Date();
    if (licenseExpiry && new Date(licenseExpiry).getTime() < now.getTime()) {
      return false;
    }
    if (insuranceExpiry && new Date(insuranceExpiry).getTime() < now.getTime()) {
      return false;
    }
    return true;
  }

  async createSubcontractor(
    orgId: string,
    userId: string,
    input: CreateSubcontractorInput,
  ): Promise<Subcontractor> {
    if (!input.companyName?.trim()) {
      throw new ValidationError("Company name is required");
    }
    if (!input.trade?.trim()) {
      throw new ValidationError("Trade is required");
    }

    const isCompliant = this.checkCompliance(input.licenseExpiry, input.insuranceExpiry);

    const subcontractor = await this.subRepo.create(orgId, userId, input, isCompliant);

    await this.audit.log({
      orgId,
      userId,
      action: SUBCONTRACTOR_AUDIT_ACTIONS.SUBCONTRACTOR_CREATED,
      entity: "subcontractor",
      entityId: subcontractor.id,
      newValue: {
        companyName: subcontractor.companyName,
        trade: subcontractor.trade,
        isCompliant,
      },
    });

    return subcontractor;
  }

  async getSubcontractor(orgId: string, id: string): Promise<Subcontractor> {
    const subcontractor = await this.subRepo.findById(orgId, id);
    if (!subcontractor || subcontractor.orgId !== orgId) {
      throw new NotFoundError("Subcontractor not found");
    }
    return subcontractor;
  }

  async listSubcontractors(
    orgId: string,
    filters: SubcontractorFilters = {},
  ): Promise<Subcontractor[]> {
    return this.subRepo.findByOrg(orgId, filters);
  }

  async updateSubcontractor(
    orgId: string,
    id: string,
    userId: string,
    input: UpdateSubcontractorInput,
  ): Promise<Subcontractor> {
    const existing = await this.getSubcontractor(orgId, id);

    let isCompliant = existing.isCompliant;
    const licenseExpiry = input.licenseExpiry !== undefined ? input.licenseExpiry : existing.licenseExpiry;
    const insuranceExpiry = input.insuranceExpiry !== undefined ? input.insuranceExpiry : existing.insuranceExpiry;
    if (input.licenseExpiry !== undefined || input.insuranceExpiry !== undefined) {
      isCompliant = this.checkCompliance(licenseExpiry, insuranceExpiry);
    }
    if (input.isCompliant !== undefined) {
      isCompliant = input.isCompliant;
    }

    const updated = await this.subRepo.update(orgId, id, {
      ...input,
      isCompliant,
    });

    await this.audit.log({
      orgId,
      userId,
      action: SUBCONTRACTOR_AUDIT_ACTIONS.SUBCONTRACTOR_UPDATED,
      entity: "subcontractor",
      entityId: id,
      oldValue: {
        companyName: existing.companyName,
        trade: existing.trade,
        status: existing.status,
        isCompliant: existing.isCompliant,
      },
      newValue: {
        companyName: updated.companyName,
        trade: updated.trade,
        status: updated.status,
        isCompliant: updated.isCompliant,
      },
    });

    return updated;
  }

  async createContract(
    orgId: string,
    projectId: string,
    userId: string,
    input: CreateSubcontractorContractInput,
  ): Promise<SubcontractorContract> {
    const project = await this.projectRepo.findById(orgId, projectId);
    if (!project || project.orgId !== orgId) {
      throw new NotFoundError("Project not found");
    }
    if (project.status === "COMPLETED" || project.status === "CANCELLED") {
      throw new ValidationError(`Cannot add contracts to a project in ${project.status} status`);
    }

    await this.getSubcontractor(orgId, input.subcontractorId);

    if (input.contractValue < 0) {
      throw new ValidationError("Contract value cannot be negative");
    }

    const count = await this.contractRepo.countByOrg(orgId);
    const contractNumber = `SC-${String(count + 1).padStart(4, "0")}`;

    const contract = await this.contractRepo.create(orgId, userId, contractNumber, {
      ...input,
      projectId,
    });

    await this.audit.log({
      orgId,
      userId,
      action: SUBCONTRACTOR_AUDIT_ACTIONS.SUBCONTRACTOR_CONTRACT_CREATED,
      entity: "subcontractor_contract",
      entityId: contract.id,
      newValue: {
        contractNumber,
        projectId,
        subcontractorId: input.subcontractorId,
        contractValue: input.contractValue,
      },
    });

    return contract;
  }

  async getContract(orgId: string, id: string): Promise<SubcontractorContract> {
    const contract = await this.contractRepo.findById(orgId, id);
    if (!contract || contract.orgId !== orgId) {
      throw new NotFoundError("Subcontractor contract not found");
    }
    return contract;
  }

  async listContractsByProject(orgId: string, projectId: string): Promise<SubcontractorContract[]> {
    const project = await this.projectRepo.findById(orgId, projectId);
    if (!project || project.orgId !== orgId) {
      throw new NotFoundError("Project not found");
    }
    return this.contractRepo.findByProject(orgId, projectId);
  }

  async listContractsBySubcontractor(
    orgId: string,
    subcontractorId: string,
  ): Promise<SubcontractorContract[]> {
    await this.getSubcontractor(orgId, subcontractorId);
    return this.contractRepo.findBySubcontractor(orgId, subcontractorId);
  }

  async updateContractStatus(
    orgId: string,
    contractId: string,
    newStatus: SubcontractorContractStatus,
    userId: string,
  ): Promise<SubcontractorContract> {
    const contract = await this.getContract(orgId, contractId);

    const allowedTransitions = SUBCONTRACTOR_CONTRACT_STATUS_TRANSITIONS[contract.status];
    if (!allowedTransitions.includes(newStatus)) {
      throw new ValidationError(
        `Invalid status transition from ${contract.status} to ${newStatus}. Allowed: ${allowedTransitions.join(", ") || "none"}`,
      );
    }

    const updated = await this.contractRepo.update(orgId, contractId, {
      status: newStatus,
    });

    await this.audit.log({
      orgId,
      userId,
      action: SUBCONTRACTOR_AUDIT_ACTIONS.SUBCONTRACTOR_CONTRACT_STATUS_CHANGED,
      entity: "subcontractor_contract",
      entityId: contractId,
      oldValue: { status: contract.status },
      newValue: { status: newStatus },
    });

    if (newStatus === "ACTIVE") {
      await this.audit.log({
        orgId,
        userId,
        action: SUBCONTRACTOR_DOMAIN_EVENTS.SUBCONTRACTOR_ASSIGNED,
        entity: "domain_event",
        entityId: contractId,
        newValue: {
          subcontractorId: contract.subcontractorId,
          projectId: contract.projectId,
          contractNumber: contract.contractNumber,
          contractValue: contract.contractValue,
        },
      });
    }

    return updated;
  }

  async assignTaskSubcontractor(
    orgId: string,
    taskId: string,
    subcontractorId: string | null,
    userId: string,
  ): Promise<void> {
    const task = await this.taskRepo.findById(orgId, taskId);
    if (!task || task.orgId !== orgId) {
      throw new NotFoundError("Task not found");
    }

    if (subcontractorId) {
      await this.getSubcontractor(orgId, subcontractorId);
    }

    await this.taskRepo.update(orgId, taskId, {
      subcontractorId,
    });

    await this.audit.log({
      orgId,
      userId,
      action: SUBCONTRACTOR_AUDIT_ACTIONS.SUBCONTRACTOR_ASSIGNED_TASK,
      entity: "task",
      entityId: taskId,
      oldValue: { subcontractorId: task.subcontractorId },
      newValue: { subcontractorId },
    });
  }
}

export const subcontractorService = new SubcontractorService();
