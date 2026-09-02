import { db } from "../../infrastructure/database/client.js";
import type { ProjectStatus } from "@prisma/client";

export interface CreateProjectInput {
  orgId: string;
  name: string;
  description?: string;
  projectNumber?: string;
  projectType?: string;
  currency?: string;
  clientName?: string;
  clientContact?: string;
  siteAddress?: string;
  siteCity?: string;
  siteCountry?: string;
  contractValue?: number;
  contractDate?: Date;
  plannedStartDate?: Date;
  plannedEndDate?: Date;
  budget?: number;
  createdById: string;
}

export interface ProjectFilters {
  status?: ProjectStatus;
  limit?: number;
  offset?: number;
}

export class ProjectRepository {
  async create(data: CreateProjectInput) {
    return db.project.create({ data: { ...data } });
  }

  // ALWAYS include orgId — Rule 5
  async findById(orgId: string, projectId: string) {
    return db.project.findFirst({ where: { id: projectId, orgId } });
  }

  async findByOrg(orgId: string, filters: ProjectFilters = {}) {
    const { status, limit = 50, offset = 0 } = filters;
    return db.project.findMany({
      where: { orgId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  async countByOrg(orgId: string) {
    return db.project.count({ where: { orgId } });
  }

  async update(
    orgId: string,
    projectId: string,
    data: Partial<CreateProjectInput> & {
      status?: ProjectStatus;
      actualStartDate?: Date;
      actualEndDate?: Date;
    },
  ) {
    return db.project.update({ where: { id: projectId, orgId }, data });
  }

  async delete(orgId: string, projectId: string) {
    return db.project.delete({ where: { id: projectId, orgId } });
  }
}

export const projectRepository = new ProjectRepository();
