import type { Prisma, TaskDependency } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import { NotFoundError } from "../../common/index.js";
import type { CreateTaskDependencyInput } from "./task.types.js";

type DependencyClient = Pick<Prisma.TransactionClient, "taskDependency">;

export class TaskDependencyRepository {
  async add(
    data: CreateTaskDependencyInput,
    client: DependencyClient = db,
  ): Promise<TaskDependency> {
    return client.taskDependency.create({
      data: {
        ...data,
        type: data.type ?? "FS",
        lagDays: data.lagDays ?? 0,
      },
    });
  }

  async remove(
    orgId: string,
    projectId: string,
    predecessorId: string,
    successorId: string,
    client: DependencyClient = db,
  ): Promise<TaskDependency> {
    const dependency = await client.taskDependency.findFirst({
      where: { orgId, projectId, predecessorId, successorId },
    });
    if (!dependency) {
      throw new NotFoundError("Dependency not found");
    }

    const deleted = await client.taskDependency.deleteMany({
      where: { id: dependency.id, orgId, projectId },
    });
    if (deleted.count === 0) {
      throw new NotFoundError("Dependency not found");
    }
    return dependency;
  }

  async findByProject(
    orgId: string,
    projectId: string,
    client: DependencyClient = db,
  ): Promise<TaskDependency[]> {
    return client.taskDependency.findMany({
      where: { orgId, projectId },
      orderBy: { createdAt: "asc" },
    });
  }

  async findPredecessors(
    orgId: string,
    taskId: string,
    client: DependencyClient = db,
  ): Promise<TaskDependency[]> {
    return client.taskDependency.findMany({
      where: { orgId, successorId: taskId },
      orderBy: { createdAt: "asc" },
    });
  }

  async findSuccessors(
    orgId: string,
    taskId: string,
    client: DependencyClient = db,
  ): Promise<TaskDependency[]> {
    return client.taskDependency.findMany({
      where: { orgId, predecessorId: taskId },
      orderBy: { createdAt: "asc" },
    });
  }
}

export const taskDependencyRepository = new TaskDependencyRepository();
