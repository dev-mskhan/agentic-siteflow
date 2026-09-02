import { ConflictError, NotFoundError } from "../../common/index.js";
import type { CostCodeRepository, CreateCostCodeInput, UpdateCostCodeInput } from "./cost-code.repository.js";
import type { AuditService } from "../audit/audit.service.js";
import { PROJECT_AUDIT_ACTIONS } from "./project.types.js";

export class CostCodeService {
  constructor(
    private readonly repo: CostCodeRepository,
    private readonly auditService: AuditService,
  ) {}

  async createCostCode(
    orgId: string,
    userId: string,
    input: Omit<CreateCostCodeInput, "orgId">,
  ) {
    const existing = await this.repo.findByOrgAndCode(orgId, input.code);
    if (existing) {
      throw new ConflictError(
        `Cost code "${input.code}" already exists in this organization`,
      );
    }

    const costCode = await this.repo.create({ ...input, orgId });

    await this.auditService.log({
      orgId,
      userId,
      action: PROJECT_AUDIT_ACTIONS.COST_CODE_CREATED,
      entity: "cost_code",
      entityId: costCode.id,
      newValue: { code: costCode.code, name: costCode.name },
    });

    return costCode;
  }

  async listCostCodes(orgId: string) {
    return this.repo.findByOrg(orgId);
  }

  async updateCostCode(
    orgId: string,
    userId: string,
    id: string,
    input: UpdateCostCodeInput,
  ) {
    const costCode = await this.repo.findById(id);
    if (!costCode || costCode.orgId !== orgId) {
      throw new NotFoundError("Cost code not found");
    }

    const updated = await this.repo.update(id, input);

    await this.auditService.log({
      orgId,
      userId,
      action: PROJECT_AUDIT_ACTIONS.COST_CODE_UPDATED,
      entity: "cost_code",
      entityId: id,
      newValue: { ...input },
    });

    return updated;
  }

  async deactivateCostCode(orgId: string, userId: string, id: string) {
    const costCode = await this.repo.findById(id);
    if (!costCode || costCode.orgId !== orgId) {
      throw new NotFoundError("Cost code not found");
    }

    const updated = await this.repo.deactivate(id);

    await this.auditService.log({
      orgId,
      userId,
      action: PROJECT_AUDIT_ACTIONS.COST_CODE_DEACTIVATED,
      entity: "cost_code",
      entityId: id,
      oldValue: { code: costCode.code, isActive: true },
      newValue: { isActive: false },
    });

    return updated;
  }
}
