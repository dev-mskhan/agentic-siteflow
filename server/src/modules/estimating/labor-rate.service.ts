import { ConflictError, NotFoundError } from "../../common/index.js";
import type { LaborRateRepository } from "./labor-rate.repository.js";
import type { AuditService } from "../audit/audit.service.js";
import { ESTIMATE_AUDIT_ACTIONS } from "./estimate.types.js";

export class LaborRateService {
  constructor(
    private readonly repo: LaborRateRepository,
    private readonly auditService: AuditService,
  ) {}

  async createLaborRate(
    orgId: string,
    userId: string,
    input: {
      classification: string;
      description?: string;
      unit?: string;
      rate: number;
      currency?: string;
      effectiveDate?: Date;
    },
  ) {
    const existing = await this.repo.findByOrgAndClassification(orgId, input.classification);
    if (existing) {
      throw new ConflictError(
        `Labor rate for classification "${input.classification}" already exists`,
      );
    }

    const laborRate = await this.repo.create({ orgId, ...input });

    await this.auditService.log({
      orgId,
      userId,
      action: ESTIMATE_AUDIT_ACTIONS.LABOR_RATE_CREATED,
      entity: "labor_rate",
      entityId: laborRate.id,
      newValue: { classification: laborRate.classification },
    });

    return laborRate;
  }

  async listLaborRates(orgId: string) {
    return this.repo.findByOrg(orgId);
  }

  async updateLaborRate(
    orgId: string,
    id: string,
    userId: string,
    input: Partial<{
      classification: string;
      description: string;
      unit: string;
      rate: number;
      currency: string;
    }>,
  ) {
    const laborRate = await this.repo.findById(id);
    if (!laborRate || laborRate.orgId !== orgId) {
      throw new NotFoundError("Labor rate not found");
    }

    const updated = await this.repo.update(id, input);

    await this.auditService.log({
      orgId,
      userId,
      action: ESTIMATE_AUDIT_ACTIONS.LABOR_RATE_UPDATED,
      entity: "labor_rate",
      entityId: id,
      newValue: { ...input },
    });

    return updated;
  }

  async deactivateLaborRate(orgId: string, id: string, userId: string) {
    const laborRate = await this.repo.findById(id);
    if (!laborRate || laborRate.orgId !== orgId) {
      throw new NotFoundError("Labor rate not found");
    }

    const updated = await this.repo.deactivate(id);

    await this.auditService.log({
      orgId,
      userId,
      action: ESTIMATE_AUDIT_ACTIONS.LABOR_RATE_DEACTIVATED,
      entity: "labor_rate",
      entityId: id,
    });

    return updated;
  }
}
