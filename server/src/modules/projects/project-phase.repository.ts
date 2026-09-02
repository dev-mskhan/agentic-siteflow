import { db } from "../../infrastructure/database/client.js";

export interface CreatePhaseInput {
  projectId: string;
  orgId: string;
  name: string;
  description?: string;
  color?: string;
  order?: number;
  plannedStartDate?: Date;
  plannedEndDate?: Date;
}

export interface UpdatePhaseInput {
  name?: string;
  description?: string;
  color?: string;
  plannedStartDate?: Date;
  plannedEndDate?: Date;
  actualStartDate?: Date;
  actualEndDate?: Date;
  status?: string;
}

export class ProjectPhaseRepository {
  async create(data: CreatePhaseInput) {
    return db.projectPhase.create({ data });
  }

  async findByProject(projectId: string) {
    return db.projectPhase.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
    });
  }

  async findById(id: string) {
    return db.projectPhase.findUnique({ where: { id } });
  }

  async update(id: string, data: UpdatePhaseInput) {
    return db.projectPhase.update({ where: { id }, data });
  }

  async delete(id: string) {
    return db.projectPhase.delete({ where: { id } });
  }

  async countByProject(projectId: string) {
    return db.projectPhase.count({ where: { projectId } });
  }

  async reorder(projectId: string, orderedIds: string[]) {
    return db.$transaction(
      orderedIds.map((id, index) =>
        db.projectPhase.update({
          where: { id },
          data: { order: index },
        }),
      ),
    );
  }
}

export const projectPhaseRepository = new ProjectPhaseRepository();
