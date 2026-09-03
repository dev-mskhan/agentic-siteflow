import type { Milestone, Prisma } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";

export interface MilestoneFilters {
  status?: string;
  dueDateBefore?: Date;
}

export interface CreateMilestoneData {
  projectId: string;
  orgId: string;
  name: string;
  description?: string | null;
  dueDate: Date;
  status?: string;
  linkedTaskId?: string | null;
  createdById: string;
}

export class MilestoneRepository {
  async create(data: CreateMilestoneData): Promise<Milestone> {
    return db.milestone.create({ data });
  }

  async findByProject(
    orgId: string,
    projectId: string,
    filters: MilestoneFilters = {},
  ): Promise<Milestone[]> {
    return db.milestone.findMany({
      where: {
        orgId,
        projectId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.dueDateBefore ? { dueDate: { lt: filters.dueDateBefore } } : {}),
      },
      orderBy: { dueDate: "asc" },
    });
  }

  async findById(orgId: string, id: string): Promise<Milestone | null> {
    return db.milestone.findFirst({ where: { id, orgId } });
  }

  async update(
    orgId: string,
    id: string,
    data: Prisma.MilestoneUncheckedUpdateInput,
  ): Promise<Milestone> {
    return db.milestone.update({ where: { id }, data: { ...data, orgId } });
  }

  async delete(orgId: string, id: string): Promise<Milestone> {
    const milestone = await db.milestone.findFirst({ where: { id, orgId } });
    if (!milestone) throw new Error("Milestone not found");
    await db.milestone.delete({ where: { id } });
    return milestone;
  }
}

export const milestoneRepository = new MilestoneRepository();
