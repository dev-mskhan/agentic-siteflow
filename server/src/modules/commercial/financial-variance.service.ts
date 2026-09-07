import { NotFoundError } from "../../common/AppError.js";
import { cacheGet, cacheSet, cacheKey, CACHE_TTL } from "../../infrastructure/redis/cache.js";
import { projectRepository as defaultProjectRepository, type ProjectRepository } from "../projects/project.repository.js";
import {
  financialVarianceRepository as defaultVarianceRepo,
  type FinancialVarianceRepository,
} from "./financial-variance.repository.js";
import type {
  CostCodeFinancialSummary,
  OrgCommercialOverview,
  ProjectCommercialOverview,
} from "./financial-variance.types.js";

export class FinancialVarianceService {
  constructor(
    private readonly varianceRepo: FinancialVarianceRepository = defaultVarianceRepo,
    private readonly projectRepo: ProjectRepository = defaultProjectRepository,
  ) {}

  async getProjectCommercialOverview(
    orgId: string,
    projectId: string,
  ): Promise<ProjectCommercialOverview> {
    const cached = await cacheGet<ProjectCommercialOverview>(cacheKey.financialOverview(projectId));
    if (cached) return cached;

    const project = await this.projectRepo.findById(orgId, projectId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }

    const [budgetItems, commitments, actuals] = await Promise.all([
      this.varianceRepo.getProjectBudgetItems(orgId, projectId),
      this.varianceRepo.getProjectCommittedCosts(orgId, projectId),
      this.varianceRepo.getProjectActualCosts(orgId, projectId),
    ]);

    // Committed map by costCodeId
    const committedMap = new Map<string, number>();
    for (const po of commitments.pos) {
      if (po.costCodeId) {
        committedMap.set(
          po.costCodeId,
          (committedMap.get(po.costCodeId) || 0) + Number(po.totalPrice),
        );
      }
    }
    for (const c of commitments.contracts) {
      if (c.costCodeId) {
        committedMap.set(
          c.costCodeId,
          (committedMap.get(c.costCodeId) || 0) + Number(c.contractValue),
        );
      }
    }

    // Actual map by costCodeId
    const actualMap = new Map<string, number>();
    for (const act of actuals) {
      actualMap.set(
        act.costCodeId,
        (actualMap.get(act.costCodeId) || 0) + Number(act.amount),
      );
    }

    const costCodeBreakdown: CostCodeFinancialSummary[] = [];

    // Collect all unique costCodeIds
    const allCodeIds = new Set<string>();
    for (const b of budgetItems) allCodeIds.add(b.costCodeId);
    for (const codeId of committedMap.keys()) allCodeIds.add(codeId);
    for (const codeId of actualMap.keys()) allCodeIds.add(codeId);

    // Map budget items by costCodeId
    const budgetMap = new Map(budgetItems.map((b) => [b.costCodeId, b]));

    let totalOriginalBudget = 0;
    let totalApprovedChanges = 0;
    let totalRevisedBudget = 0;
    let totalCommittedCost = 0;
    let totalActualCost = 0;
    let totalForecastCost = 0;

    for (const codeId of allCodeIds) {
      const bItem = budgetMap.get(codeId);
      const originalBudget = bItem ? Number(bItem.originalAmount) : 0;
      const approvedChanges = bItem ? Number(bItem.approvedChanges) : 0;
      const revisedBudget = bItem ? Number(bItem.revisedAmount) : 0;
      const committedCost = committedMap.get(codeId) || 0;
      const actualCost = actualMap.get(codeId) || 0;

      // FAC = actualCost + max(0, committedCost - actualCost)
      const forecastCost = actualCost + Math.max(0, committedCost - actualCost);
      const variance = revisedBudget - forecastCost;
      const percentSpent = revisedBudget > 0 ? (actualCost / revisedBudget) * 100 : 0;
      const percentCommitted = revisedBudget > 0 ? (committedCost / revisedBudget) * 100 : 0;
      const isOverBudget = forecastCost > revisedBudget;

      totalOriginalBudget += originalBudget;
      totalApprovedChanges += approvedChanges;
      totalRevisedBudget += revisedBudget;
      totalCommittedCost += committedCost;
      totalActualCost += actualCost;
      totalForecastCost += forecastCost;

      costCodeBreakdown.push({
        costCodeId: codeId,
        costCode: bItem?.costCode?.code ?? "UNKNOWN",
        name: bItem?.costCode?.name ?? "Unknown Code",
        category: bItem?.costCode?.category ?? null,
        originalBudget,
        approvedChanges,
        revisedBudget,
        committedCost,
        actualCost,
        forecastCost,
        variance,
        percentSpent,
        percentCommitted,
        isOverBudget,
      });
    }

    const totalVariance = totalRevisedBudget - totalForecastCost;
    const isOverBudget = totalForecastCost > totalRevisedBudget;

    // Burn rate: actualCost per day if dates available
    let burnRate = 0;
    if (project.plannedStartDate) {
      const start = new Date(project.plannedStartDate).getTime();
      const now = Date.now();
      const elapsedDays = Math.max(1, Math.round((now - start) / (1000 * 60 * 60 * 24)));
      burnRate = Math.round((totalActualCost / elapsedDays) * 100) / 100;
    }

    const overview: ProjectCommercialOverview = {
      projectId,
      projectName: project.name,
      currency: project.currency ?? "USD",
      totalOriginalBudget,
      totalApprovedChanges,
      totalRevisedBudget,
      totalCommittedCost,
      totalActualCost,
      totalForecastCost,
      totalVariance,
      burnRate,
      isOverBudget,
      costCodeBreakdown,
    };
    await cacheSet(cacheKey.financialOverview(projectId), overview, CACHE_TTL.FINANCIAL);
    return overview;
  }

  async getOrgCommercialOverview(orgId: string): Promise<OrgCommercialOverview> {
    const cached = await cacheGet<OrgCommercialOverview>(cacheKey.orgFinancialOverview(orgId));
    if (cached) return cached;

    const projects = await this.varianceRepo.listOrgProjects(orgId);

    const projectSummaries = [];
    let totalBudget = 0;
    let totalCommitted = 0;
    let totalActual = 0;
    let totalVariance = 0;
    let overBudgetProjectsCount = 0;

    for (const p of projects) {
      const overview = await this.getProjectCommercialOverview(orgId, p.id);
      totalBudget += overview.totalRevisedBudget;
      totalCommitted += overview.totalCommittedCost;
      totalActual += overview.totalActualCost;
      totalVariance += overview.totalVariance;
      if (overview.isOverBudget) {
        overBudgetProjectsCount++;
      }

      projectSummaries.push({
        projectId: p.id,
        projectName: p.name,
        revisedBudget: overview.totalRevisedBudget,
        committedCost: overview.totalCommittedCost,
        actualCost: overview.totalActualCost,
        forecastCost: overview.totalForecastCost,
        variance: overview.totalVariance,
        isOverBudget: overview.isOverBudget,
      });
    }

    const result: OrgCommercialOverview = {
      totalBudget,
      totalCommitted,
      totalActual,
      totalVariance,
      projectsCount: projects.length,
      overBudgetProjectsCount,
      projectSummaries,
    };
    await cacheSet(cacheKey.orgFinancialOverview(orgId), result, CACHE_TTL.FINANCIAL);
    return result;
  }
}

export const financialVarianceService = new FinancialVarianceService();
