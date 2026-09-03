import type { Prisma, TaskDateChange } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";

type DateChangeClient = Pick<Prisma.TransactionClient, "taskDateChange">;

export interface CreateTaskDateChangeInput {
  taskId: string;
  projectId: string;
  orgId: string;
  field: string;
  oldValue?: string | null;
  newValue?: string | null;
  reason: string;
  changedById: string;
  changedAt?: Date;
}

export class TaskDateChangeRepository {
  async record(
    data: CreateTaskDateChangeInput,
    client: DateChangeClient = db,
  ): Promise<TaskDateChange> {
    return client.taskDateChange.create({ data });
  }

  async findByTask(orgId: string, taskId?: string): Promise<TaskDateChange[]> {
    return db.taskDateChange.findMany({
      where: taskId ? { orgId, taskId } : { taskId: orgId },
      orderBy: { changedAt: "desc" },
    });
  }

  async findByProject(orgId: string, projectId?: string): Promise<TaskDateChange[]> {
    return db.taskDateChange.findMany({
      where: projectId ? { orgId, projectId } : { projectId: orgId },
      orderBy: { changedAt: "desc" },
    });
  }
}

export const taskDateChangeRepository = new TaskDateChangeRepository();
