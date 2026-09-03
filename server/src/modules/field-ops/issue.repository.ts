import type { Issue, Prisma } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type { IssueFilters } from "./field-ops.types.js";

export interface CreateIssueData {
  projectId: string;
  orgId: string;
  title: string;
  description: string;
  category?: string | null;
  priority?: Issue["priority"];
  status?: Issue["status"];
  responsiblePartyId?: string | null;
  dueDate?: Date | null;
  hasProjectImpact?: boolean;
  projectImpactDescription?: string | null;
  hasCostImpact?: boolean;
  costImpactAmount?: number | null;
  hasScheduleImpact?: boolean;
  scheduleImpactDays?: number | null;
  linkedTaskId?: string | null;
  createdById: string;
}

export class IssueRepository {
  async create(data: CreateIssueData): Promise<Issue> {
    return db.issue.create({ data });
  }

  async findById(orgId: string, id: string): Promise<Issue | null> {
    return db.issue.findFirst({ where: { orgId, id } });
  }

  async findByProject(orgId: string, projectId: string, filters: IssueFilters = {}): Promise<Issue[]> {
    const { status, priority, category, limit = 50, offset = 0 } = filters;
    return db.issue.findMany({
      where: {
        orgId,
        projectId,
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(category ? { category } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  async update(orgId: string, id: string, data: Prisma.IssueUncheckedUpdateInput): Promise<Issue> {
    return db.issue.update({ where: { id }, data: { ...data, orgId } });
  }
}

export const issueRepository = new IssueRepository();
