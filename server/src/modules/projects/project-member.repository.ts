import { db } from "../../infrastructure/database/client.js";
import type { ProjectRole } from "@prisma/client";

export interface CreateProjectMemberInput {
  projectId: string;
  userId: string;
  orgId: string;
  role: ProjectRole;
  addedById?: string;
}

export class ProjectMemberRepository {
  async addMember(data: CreateProjectMemberInput) {
    return db.projectMember.create({ data });
  }

  async removeMember(projectId: string, userId: string) {
    return db.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });
  }

  async findByProject(projectId: string) {
    return db.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async findMembership(projectId: string, userId: string) {
    return db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
  }

  async updateRole(projectId: string, userId: string, role: ProjectRole) {
    return db.projectMember.update({
      where: { projectId_userId: { projectId, userId } },
      data: { role },
    });
  }
}

export const projectMemberRepository = new ProjectMemberRepository();
