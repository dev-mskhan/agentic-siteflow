import type { Prisma, ScheduleBaseline } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";

type BaselineClient = Pick<Prisma.TransactionClient, "scheduleBaseline">;

export interface ScheduleBaselineData {
  projectId: string;
  orgId: string;
  name?: string;
  capturedById: string;
  taskSnapshots: Prisma.InputJsonValue;
  capturedAt?: Date;
}

export class ScheduleBaselineRepository {
  async capture(
    data: ScheduleBaselineData,
    client: BaselineClient = db,
  ): Promise<ScheduleBaseline> {
    return client.scheduleBaseline.create({
      data: {
        projectId: data.projectId,
        orgId: data.orgId,
        name: data.name ?? "Original Baseline",
        capturedById: data.capturedById,
        taskSnapshots: data.taskSnapshots,
        ...(data.capturedAt ? { capturedAt: data.capturedAt } : {}),
      },
    });
  }

  async findByProject(orgId: string, projectId?: string): Promise<ScheduleBaseline | null> {
    return db.scheduleBaseline.findFirst({
      where: projectId ? { orgId, projectId } : { projectId: orgId },
    });
  }

  async replace(
    projectId: string,
    data: ScheduleBaselineData,
    client: BaselineClient = db,
  ): Promise<ScheduleBaseline> {
    const existing = await client.scheduleBaseline.findFirst({
      where: { projectId, orgId: data.orgId },
    });
    if (existing) {
      return client.scheduleBaseline.update({
        where: { id: existing.id },
        data: {
          name: data.name ?? "Original Baseline",
          capturedById: data.capturedById,
          taskSnapshots: data.taskSnapshots,
          capturedAt: data.capturedAt ?? new Date(),
        },
      });
    }
    return this.capture({ ...data, projectId }, client);
  }
}

export const scheduleBaselineRepository = new ScheduleBaselineRepository();
