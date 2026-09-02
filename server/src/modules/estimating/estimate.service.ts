import { db } from "../../infrastructure/database/client.js";
import { NotFoundError, ValidationError } from "../../common/index.js";
import type { EstimateRepository } from "./estimate.repository.js";
import type { EstimateVersionRepository } from "./estimate-version.repository.js";
import type { BoqItemRepository } from "./boq-item.repository.js";
import type { AuditService } from "../audit/audit.service.js";
import type { CreateEstimateInput, UpdateEstimateInput, EstimateFilters } from "./estimate.types.js";
import {
  ESTIMATE_STATUS_TRANSITIONS,
  EDITABLE_STATUSES,
  ESTIMATE_AUDIT_ACTIONS,
} from "./estimate.types.js";
import type { EstimateStatus } from "@prisma/client";
import {
  calcDirectCostRate,
  calcDirectCostAmount,
  calcSellingRate,
  calcItemAmount,
  calcSubtotal,
  calcOverhead,
  calcContingency,
  calcTotalCost,
  calcMarkupAmount,
  calcSellingPrice,
  calcMargin,
  calcMaterialSubtotal,
  calcLaborSubtotal,
  calcEquipmentSubtotal,
  calcSubcontractorSubtotal,
} from "./calculation.js";

export class EstimateService {
  constructor(
    private readonly repo: EstimateRepository,
    private readonly versionRepo: EstimateVersionRepository,
    private readonly boqItemRepo: BoqItemRepository,
    private readonly auditService: AuditService,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async createEstimate(orgId: string, userId: string, input: CreateEstimateInput) {
    if (!input.name?.trim()) throw new ValidationError("Estimate name is required");

    const count = await this.repo.countByOrg(orgId);
    const estimateNumber = `EST-${String(count + 1).padStart(4, "0")}`;

    const estimate = await this.repo.create({
      ...input,
      orgId,
      estimateNumber,
      createdById: userId,
    });

    await this.auditService.log({
      orgId,
      userId,
      action: ESTIMATE_AUDIT_ACTIONS.ESTIMATE_CREATED,
      entity: "estimate",
      entityId: estimate.id,
      newValue: { name: estimate.name, estimateNumber },
    });

    return estimate;
  }

  async getEstimate(orgId: string, estimateId: string) {
    const estimate = await this.repo.findById(orgId, estimateId);
    if (!estimate) throw new NotFoundError("Estimate not found");
    return estimate;
  }

  async listEstimates(orgId: string, filters?: EstimateFilters) {
    return this.repo.findByOrg(orgId, filters);
  }

  async updateEstimate(
    orgId: string,
    estimateId: string,
    userId: string,
    input: UpdateEstimateInput,
  ) {
    const estimate = await this.getEstimate(orgId, estimateId);
    if (!EDITABLE_STATUSES.includes(estimate.status)) {
      throw new ValidationError(
        `Cannot update an estimate with status ${estimate.status}`,
      );
    }

    const updated = await this.repo.update(orgId, estimateId, input);

    await this.auditService.log({
      orgId,
      userId,
      action: ESTIMATE_AUDIT_ACTIONS.ESTIMATE_UPDATED,
      entity: "estimate",
      entityId: estimateId,
      oldValue: { name: estimate.name },
      newValue: { ...input },
    });

    return updated;
  }

  // ─── Status lifecycle ──────────────────────────────────────────────────────

  async transitionStatus(
    orgId: string,
    estimateId: string,
    newStatus: EstimateStatus,
    userId: string,
    reason?: string,
  ) {
    const estimate = await this.getEstimate(orgId, estimateId);
    const allowed = ESTIMATE_STATUS_TRANSITIONS[estimate.status] ?? [];

    if (!allowed.includes(newStatus)) {
      throw new ValidationError(
        `Invalid status transition from ${estimate.status} to ${newStatus}`,
      );
    }

    // Snapshot before transitioning to UNDER_REVIEW
    if (newStatus === "UNDER_REVIEW") {
      await this.createVersion(orgId, estimateId, userId, "Submitted for review");
    }

    const updated = await this.repo.update(orgId, estimateId, { status: newStatus });

    await this.auditService.log({
      orgId,
      userId,
      action: ESTIMATE_AUDIT_ACTIONS.ESTIMATE_STATUS_CHANGED,
      entity: "estimate",
      entityId: estimateId,
      oldValue: { status: estimate.status },
      newValue: { status: newStatus, ...(reason ? { reason } : {}) },
    });

    return updated;
  }

  // ─── Versioning ────────────────────────────────────────────────────────────

  async createVersion(
    orgId: string,
    estimateId: string,
    userId: string,
    changeNote?: string,
  ) {
    const estimate = await this.getEstimate(orgId, estimateId);
    const items = await this.boqItemRepo.findByEstimate(estimateId);

    // Convert Prisma Decimal fields to numbers for JSON serialisation
    const snapshot = {
      estimate: {
        id: estimate.id,
        orgId: estimate.orgId,
        estimateNumber: estimate.estimateNumber,
        name: estimate.name,
        description: estimate.description,
        status: estimate.status,
        version: estimate.version,
        clientName: estimate.clientName,
        clientContact: estimate.clientContact,
        siteAddress: estimate.siteAddress,
        siteCity: estimate.siteCity,
        siteCountry: estimate.siteCountry,
        currency: estimate.currency,
        validUntil: estimate.validUntil,
        notes: estimate.notes,
        scope: estimate.scope,
        subtotal: Number(estimate.subtotal),
        overhead: Number(estimate.overhead),
        contingency: Number(estimate.contingency),
        markup: Number(estimate.markup),
        totalCost: Number(estimate.totalCost),
        sellingPrice: Number(estimate.sellingPrice),
        margin: Number(estimate.margin),
        overheadPercent: Number(estimate.overheadPercent),
        contingencyPercent: Number(estimate.contingencyPercent),
        markupPercent: Number(estimate.markupPercent),
        projectId: estimate.projectId,
        createdById: estimate.createdById,
        createdAt: estimate.createdAt,
        updatedAt: estimate.updatedAt,
      },
      items: items.map((item) => ({
        id: item.id,
        estimateId: item.estimateId,
        orgId: item.orgId,
        itemCode: item.itemCode,
        description: item.description,
        category: item.category,
        unit: item.unit,
        quantity: Number(item.quantity),
        materialRate: Number(item.materialRate),
        laborRate: Number(item.laborRate),
        equipmentRate: Number(item.equipmentRate),
        subcontractorRate: Number(item.subcontractorRate),
        directCostRate: Number(item.directCostRate),
        directCostAmount: Number(item.directCostAmount),
        markupPercent: Number(item.markupPercent),
        sellingRate: Number(item.sellingRate),
        amount: Number(item.amount),
        phaseId: item.phaseId,
        costCodeId: item.costCodeId,
        notes: item.notes,
        order: item.order,
      })),
      snapshotAt: new Date().toISOString(),
    };

    const version = await this.versionRepo.create({
      estimateId,
      orgId,
      version: estimate.version,
      snapshot,
      changeNote,
      createdById: userId,
    });

    // Increment the estimate version counter
    await this.repo.update(orgId, estimateId, { version: estimate.version + 1 });

    await this.auditService.log({
      orgId,
      userId,
      action: ESTIMATE_AUDIT_ACTIONS.ESTIMATE_VERSION_CREATED,
      entity: "estimate",
      entityId: estimateId,
      newValue: { version: estimate.version, changeNote },
    });

    return version;
  }

  async listVersions(orgId: string, estimateId: string) {
    await this.getEstimate(orgId, estimateId);
    return this.versionRepo.findByEstimate(estimateId);
  }

  async getVersion(orgId: string, estimateId: string, version: number) {
    await this.getEstimate(orgId, estimateId);
    const v = await this.versionRepo.findByVersion(estimateId, version);
    if (!v) throw new NotFoundError("Version not found");
    return v;
  }

  // ─── Pricing & Totals ──────────────────────────────────────────────────────

  async recalculateTotals(orgId: string, estimateId: string) {
    const estimate = await this.getEstimate(orgId, estimateId);
    const items = await this.boqItemRepo.findByEstimate(estimateId);

    const calcItems = items.map((item) => ({
      materialRate: Number(item.materialRate),
      laborRate: Number(item.laborRate),
      equipmentRate: Number(item.equipmentRate),
      subcontractorRate: Number(item.subcontractorRate),
      quantity: Number(item.quantity),
      directCostAmount: Number(item.directCostAmount),
    }));

    const overheadPct = Number(estimate.overheadPercent);
    const contingencyPct = Number(estimate.contingencyPercent);
    const markupPct = Number(estimate.markupPercent);

    const subtotal = calcSubtotal(calcItems);
    const overhead = calcOverhead(subtotal, overheadPct);
    const contingency = calcContingency(subtotal, contingencyPct);
    const totalCost = calcTotalCost(subtotal, overhead, contingency);
    const markupAmount = calcMarkupAmount(totalCost, markupPct);
    const sellingPrice = calcSellingPrice(totalCost, markupAmount);
    const margin = calcMargin(sellingPrice, totalCost);

    return this.repo.update(orgId, estimateId, {
      subtotal,
      overhead,
      contingency,
      markup: markupAmount,
      totalCost,
      sellingPrice,
      margin,
    });
  }

  async updatePricingFactors(
    orgId: string,
    estimateId: string,
    userId: string,
    input: {
      overheadPercent?: number;
      contingencyPercent?: number;
      markupPercent?: number;
    },
  ) {
    const estimate = await this.getEstimate(orgId, estimateId);
    if (!EDITABLE_STATUSES.includes(estimate.status)) {
      throw new ValidationError(
        `Cannot update pricing for an estimate with status ${estimate.status}`,
      );
    }

    await this.repo.update(orgId, estimateId, {
      ...(input.overheadPercent !== undefined ? { overheadPercent: input.overheadPercent } : {}),
      ...(input.contingencyPercent !== undefined
        ? { contingencyPercent: input.contingencyPercent }
        : {}),
      ...(input.markupPercent !== undefined ? { markupPercent: input.markupPercent } : {}),
    });

    const updated = await this.recalculateTotals(orgId, estimateId);

    await this.auditService.log({
      orgId,
      userId,
      action: ESTIMATE_AUDIT_ACTIONS.ESTIMATE_PRICING_UPDATED,
      entity: "estimate",
      entityId: estimateId,
      newValue: { ...input },
    });

    return updated;
  }

  // ─── Breakdown & Summary ───────────────────────────────────────────────────

  async getCostBreakdown(orgId: string, estimateId: string) {
    const estimate = await this.getEstimate(orgId, estimateId);
    const items = await this.boqItemRepo.findByEstimate(estimateId);

    const calcItems = items.map((item) => ({
      materialRate: Number(item.materialRate),
      laborRate: Number(item.laborRate),
      equipmentRate: Number(item.equipmentRate),
      subcontractorRate: Number(item.subcontractorRate),
      quantity: Number(item.quantity),
      directCostAmount: Number(item.directCostAmount),
    }));

    return {
      material: calcMaterialSubtotal(calcItems),
      labor: calcLaborSubtotal(calcItems),
      equipment: calcEquipmentSubtotal(calcItems),
      subcontractor: calcSubcontractorSubtotal(calcItems),
      subtotal: Number(estimate.subtotal),
      overhead: Number(estimate.overhead),
      contingency: Number(estimate.contingency),
      markup: Number(estimate.markup),
      totalCost: Number(estimate.totalCost),
      sellingPrice: Number(estimate.sellingPrice),
      margin: Number(estimate.margin),
    };
  }

  async getSummary(orgId: string, estimateId: string) {
    const estimate = await this.getEstimate(orgId, estimateId);
    const items = await this.boqItemRepo.findByEstimate(estimateId);
    const breakdown = await this.getCostBreakdown(orgId, estimateId);

    return {
      estimate,
      itemCount: items.length,
      breakdown,
    };
  }

  // ─── Comparison ────────────────────────────────────────────────────────────

  async compareVersions(
    orgId: string,
    estimateId: string,
    versionA: number,
    versionB: number,
  ) {
    const [a, b] = await Promise.all([
      this.getVersion(orgId, estimateId, versionA),
      this.getVersion(orgId, estimateId, versionB),
    ]);

    return { versionA: a, versionB: b };
  }

  async compareEstimates(orgId: string, estimateIdA: string, estimateIdB: string) {
    const [a, b] = await Promise.all([
      this.getEstimate(orgId, estimateIdA),
      this.getEstimate(orgId, estimateIdB),
    ]);

    const [itemsA, itemsB] = await Promise.all([
      this.boqItemRepo.findByEstimate(estimateIdA),
      this.boqItemRepo.findByEstimate(estimateIdB),
    ]);

    return {
      estimateA: { estimate: a, items: itemsA },
      estimateB: { estimate: b, items: itemsB },
      delta: {
        totalCost: Number(b.totalCost) - Number(a.totalCost),
        sellingPrice: Number(b.sellingPrice) - Number(a.sellingPrice),
        itemCountDelta: itemsB.length - itemsA.length,
      },
    };
  }

  // ─── Convert to Project ────────────────────────────────────────────────────

  async convertToProject(
    orgId: string,
    estimateId: string,
    userId: string,
    input: {
      projectName?: string;
      projectType?: string;
      plannedStartDate?: Date;
      plannedEndDate?: Date;
    },
  ) {
    const estimate = await this.getEstimate(orgId, estimateId);

    if (estimate.status !== "APPROVED") {
      throw new ValidationError("Only APPROVED estimates can be converted to projects");
    }

    // Snapshot before conversion
    await this.createVersion(orgId, estimateId, userId, "Converted to project");

    const result = await db.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          orgId,
          name: input.projectName ?? estimate.name,
          projectType: input.projectType,
          currency: estimate.currency,
          clientName: estimate.clientName ?? undefined,
          clientContact: estimate.clientContact ?? undefined,
          siteAddress: estimate.siteAddress ?? undefined,
          siteCity: estimate.siteCity ?? undefined,
          siteCountry: estimate.siteCountry ?? undefined,
          plannedStartDate: input.plannedStartDate,
          plannedEndDate: input.plannedEndDate,
          budget: Number(estimate.sellingPrice),
          createdById: userId,
          projectNumber: `PRJ-FROM-${estimate.estimateNumber}`,
        },
      });

      await tx.projectSettings.create({ data: { projectId: project.id } });

      const updatedEstimate = await tx.estimate.update({
        where: { id: estimateId, orgId },
        data: { status: "CONVERTED", projectId: project.id },
      });

      return { project, estimate: updatedEstimate };
    });

    await this.auditService.log({
      orgId,
      userId,
      action: ESTIMATE_AUDIT_ACTIONS.ESTIMATE_CONVERTED,
      entity: "estimate",
      entityId: estimateId,
      newValue: { projectId: result.project.id },
    });

    return result;
  }

  // ─── Item calculations (used by BoqService) ───────────────────────────────

  computeItemFields(
    materialRate: number,
    laborRate: number,
    equipmentRate: number,
    subcontractorRate: number,
    quantity: number,
    markupPercent: number,
  ) {
    const directCostRate = calcDirectCostRate(
      materialRate,
      laborRate,
      equipmentRate,
      subcontractorRate,
    );
    const directCostAmount = calcDirectCostAmount(directCostRate, quantity);
    const sellingRate = calcSellingRate(directCostRate, markupPercent);
    const amount = calcItemAmount(sellingRate, quantity);

    return { directCostRate, directCostAmount, sellingRate, amount };
  }
}
