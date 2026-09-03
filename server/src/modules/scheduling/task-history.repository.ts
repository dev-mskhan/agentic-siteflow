import type { TaskHistory } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type { CreateTaskHistoryInput } from "./task.types.js";

export class TaskHistoryRepository {
  async create(data: CreateTaskHistoryInput): Promise<TaskHistory> {
    return db.taskHistory.create({ data });
  }

  async findByTask(orgId: string, taskId: string): Promise<TaskHistory[]> {
    return db.taskHistory.findMany({
      where: { orgId, taskId },
      orderBy: { changedAt: "desc" },
    });
  }

  async listByTask(orgId: string, taskId: string): Promise<TaskHistory[]> {
    return this.findByTask(orgId, taskId);
  }

  async findByProject(orgId: string, projectId: string): Promise<TaskHistory[]> {
    return db.taskHistory.findMany({
      where: { orgId, projectId },
      orderBy: { changedAt: "desc" },
    });
  }
}

export const taskHistoryRepository = new TaskHistoryRepository();
