import { NotFoundError } from "../../common/index.js";
import {
  committedCostRepository as defaultRepo,
  type CommittedCostRepository,
} from "./committed-cost.repository.js";
import type {
  CostCodeCommittedBreakdown,
  OrgCommittedCostOverview,
  ProjectCommittedCostItem,
  ProjectCommittedCostSummary,
} from "./committed-cost.types.js";

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export class CommittedCostService {
  constructor(
    private readonly repo: CommittedCostRepository = defaultRepo,
  ) {}

  /**
   * 5.8.2 — Calculate project committed costs from issued/received POs
   * and active/completed subcontractor contracts.
   */
  async getProjectCommittedCost(
    orgId: string,
    projectId: string,
  ): Promise<ProjectCommittedCostSummary> {
    const project = await this.repo.findProject(orgId, projectId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }

    const [purchaseOrders, contracts] = await Promise.all([
      this.repo.getCommittedPurchaseOrders(orgId, projectId),
      this.repo.getCommittedSubcontractorContracts(orgId, projectId),
    ]);

    // Track commitments by cost code ID
    const costCodeMap = new Map<
      string,
      { poCommitted: number; subCommitted: number }
    >();

    let poCommittedTotal = 0;
    for (const po of purchaseOrders) {
      for (const item of po.items) {
        const itemTotal = Number(item.totalPrice);
        poCommittedTotal += itemTotal;

        if (item.costCodeId) {
          const entry = costCodeMap.get(item.costCodeId) ?? {
            poCommitted: 0,
            subCommitted: 0,
          };
          entry.poCommitted += itemTotal;
          costCodeMap.set(item.costCodeId, entry);
        }
      }
    }

    let subcontractorCommittedTotal = 0;
    for (const contract of contracts) {
      const contractVal = Number(contract.contractValue);
      subcontractorCommittedTotal += contractVal;

      if (contract.costCodeId) {
        const entry = costCodeMap.get(contract.costCodeId) ?? {
          poCommitted: 0,
          subCommitted: 0,
        };
        entry.subCommitted += contractVal;
        costCodeMap.set(contract.costCodeId, entry);
      }
    }

    // Fetch cost code details
    const costCodeIds = Array.from(costCodeMap.keys());
    const costCodes = await this.repo.getCostCodesByIds(orgId, costCodeIds);
    const costCodeLookup = new Map(costCodes.map((c) => [c.id, c]));

    const costCodeBreakdown: CostCodeCommittedBreakdown[] = costCodeIds.map((id) => {
      const details = costCodeLookup.get(id);
      const amounts = costCodeMap.get(id)!;
      const poAmt = round2(amounts.poCommitted);
      const subAmt = round2(amounts.subCommitted);
      return {
        costCodeId: id,
        code: details?.code ?? "UNKNOWN",
        name: details?.name ?? "Unknown Cost Code",
        poCommitted: poAmt,
        subcontractorCommitted: subAmt,
        totalCommitted: round2(poAmt + subAmt),
      };
    });

    const poTotal = round2(poCommittedTotal);
    const subTotal = round2(subcontractorCommittedTotal);
    const totalCommittedCost = round2(poTotal + subTotal);
    const budget = project.budget != null ? round2(Number(project.budget)) : null;
    const uncommittedBudget = budget != null ? round2(budget - totalCommittedCost) : null;
    const isOverCommitted = budget != null && totalCommittedCost > budget;

    return {
      projectId: project.id,
      currency: project.currency,
      poCommittedTotal: poTotal,
      subcontractorCommittedTotal: subTotal,
      totalCommittedCost,
      budget,
      uncommittedBudget,
      isOverCommitted,
      costCodeBreakdown,
    };
  }

  /**
   * 5.8.2 — Executive / finance overview of committed costs across all active projects.
   */
  async getOrgCommittedCostOverview(orgId: string): Promise<OrgCommittedCostOverview> {
    const projects = await this.repo.findOrgProjects(orgId);

    const projectSummaries: ProjectCommittedCostItem[] = [];
    let orgTotalPo = 0;
    let orgTotalSub = 0;

    for (const p of projects) {
      const summary = await this.getProjectCommittedCost(orgId, p.id);
      orgTotalPo += summary.poCommittedTotal;
      orgTotalSub += summary.subcontractorCommittedTotal;

      projectSummaries.push({
        projectId: p.id,
        projectName: p.name,
        currency: summary.currency,
        poCommittedTotal: summary.poCommittedTotal,
        subcontractorCommittedTotal: summary.subcontractorCommittedTotal,
        totalCommittedCost: summary.totalCommittedCost,
        budget: summary.budget,
        uncommittedBudget: summary.uncommittedBudget,
        isOverCommitted: summary.isOverCommitted,
      });
    }

    const totalPoCommitted = round2(orgTotalPo);
    const totalSubcontractorCommitted = round2(orgTotalSub);
    const totalCommittedCost = round2(totalPoCommitted + totalSubcontractorCommitted);

    return {
      orgId,
      totalPoCommitted,
      totalSubcontractorCommitted,
      totalCommittedCost,
      projects: projectSummaries,
    };
  }
}

export const committedCostService = new CommittedCostService();
