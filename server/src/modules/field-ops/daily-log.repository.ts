import type { DailyLog, Prisma } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type { DailyLogFilters, DailyLogInput } from "./field-ops.types.js";

export class DailyLogRepository {
  async create(
    data: DailyLogInput & { orgId: string; projectId: string; createdById: string },
  ): Promise<DailyLog> {
    return db.dailyLog.create({
      data: {
        ...data,
        quantitiesCompleted: data.quantitiesCompleted,
        deliveries: data.deliveries,
        delays: data.delays,
        safetyEvents: data.safetyEvents,
      } as Prisma.DailyLogUncheckedCreateInput,
    });
  }

  async findByProject(
    orgId: string,
    projectId: string,
    filters: DailyLogFilters = {},
  ): Promise<DailyLog[]> {
    const { from, to, limit = 50, offset = 0 } = filters;
    return db.dailyLog.findMany({
      where: {
        orgId,
        projectId,
        ...(from || to ? { logDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      orderBy: { logDate: "desc" },
      take: limit,
      skip: offset,
    });
  }

  async findByDate(orgId: string, projectId: string, logDate: Date): Promise<DailyLog | null> {
    return db.dailyLog.findFirst({ where: { orgId, projectId, logDate } });
  }

  async findById(orgId: string, id: string): Promise<DailyLog | null> {
    return db.dailyLog.findFirst({ where: { orgId, id } });
  }

  async update(
    orgId: string,
    id: string,
    data: Partial<DailyLogInput>,
  ): Promise<DailyLog> {
    const jsonData = {
      ...data,
      ...(data.quantitiesCompleted !== undefined
        ? { quantitiesCompleted: data.quantitiesCompleted as unknown as Prisma.InputJsonValue }
        : {}),
      ...(data.deliveries !== undefined
        ? { deliveries: data.deliveries as unknown as Prisma.InputJsonValue }
        : {}),
      ...(data.delays !== undefined
        ? { delays: data.delays as unknown as Prisma.InputJsonValue }
        : {}),
      ...(data.safetyEvents !== undefined
        ? { safetyEvents: data.safetyEvents as unknown as Prisma.InputJsonValue }
        : {}),
    };
    return db.dailyLog.update({ where: { id }, data: jsonData as Prisma.DailyLogUncheckedUpdateInput });
  }
}

export const dailyLogRepository = new DailyLogRepository();
