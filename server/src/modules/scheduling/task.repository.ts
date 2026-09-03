import type { Task } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type { CreateTaskInput, TaskFilters, UpdateTaskInput } from "./task.types.js";

export class TaskRepository {
  async create(data: CreateTaskInput): Promise<Task> {
    return db.task.create({ data });
  }

  async findById(orgId: string, id: string): Promise<Task | null> {
    return db.task.findFirst({
      where: { id, orgId },
    });
  }

  async findByProject(
    orgId: string,
    projectId: string,
    filters: TaskFilters = {},
  ): Promise<Task[]> {
    const { status, phaseId, assigneeId, priority, limit = 50, offset = 0 } = filters;

    return db.task.findMany({
      where: {
        orgId,
        projectId,
        ...(status ? { status } : {}),
        ...(phaseId ? { phaseId } : {}),
        ...(assigneeId ? { assigneeId } : {}),
        ...(priority ? { priority } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  async findByPhase(orgId: string, phaseId: string): Promise<Task[]> {
    return db.task.findMany({
      where: { orgId, phaseId },
      orderBy: { createdAt: "desc" },
    });
  }

  async update(orgId: string, id: string, data: UpdateTaskInput): Promise<Task> {
    return db.task.update({
      where: { id, orgId },
      data,
    });
  }

  async delete(orgId: string, id: string): Promise<Task> {
    return db.task.delete({
      where: { id, orgId },
    });
  }

  async countByPhase(phaseId: string): Promise<number> {
    return db.task.count({
      where: { phaseId },
    });
  }
}

export const taskRepository = new TaskRepository();
