import type { Prisma, Rfi, RfiResponse } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type { CreateRfiInput, UpdateRfiInput, RfiFilters } from "./rfi.types.js";

export type RfiWithDetails = Rfi & {
  responses: RfiResponse[];
};

export class RfiRepository {
  async findById(orgId: string, id: string): Promise<RfiWithDetails | null> {
    return db.rfi.findFirst({
      where: { id, orgId },
      include: {
        responses: { orderBy: { createdAt: "asc" } },
      },
    });
  }

  async findProject(orgId: string, projectId: string) {
    return db.project.findFirst({
      where: { id: projectId, orgId },
      select: { id: true },
    });
  }

  async findTask(orgId: string, taskId: string) {
    return db.task.findFirst({
      where: { id: taskId, orgId },
      select: { id: true, projectId: true },
    });
  }

  async getNextRfiNumber(projectId: string): Promise<string> {
    const count = await db.rfi.count({ where: { projectId } });
    const nextNum = count + 1;
    return `RFI-${String(nextNum).padStart(3, "0")}`;
  }

  async create(
    orgId: string,
    userId: string,
    rfiNumber: string,
    input: CreateRfiInput,
  ): Promise<RfiWithDetails> {
    return db.rfi.create({
      data: {
        orgId,
        projectId: input.projectId,
        rfiNumber,
        title: input.title,
        question: input.question,
        suggestedSolution: input.suggestedSolution ?? null,
        discipline: input.discipline ?? "GENERAL",
        priority: input.priority ?? "MEDIUM",
        status: "OPEN",
        dueDate: input.dueDate ?? null,
        scheduleImpactDays: input.scheduleImpactDays ?? null,
        costImpactAmount: input.costImpactAmount !== undefined ? input.costImpactAmount : null,
        linkedTaskId: input.linkedTaskId ?? null,
        assignedToId: input.assignedToId ?? null,
        requestedById: userId,
      },
      include: {
        responses: { orderBy: { createdAt: "asc" } },
      },
    });
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateRfiInput,
  ): Promise<RfiWithDetails> {
    return db.rfi.update({
      where: { id, orgId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.question !== undefined ? { question: input.question } : {}),
        ...(input.suggestedSolution !== undefined ? { suggestedSolution: input.suggestedSolution } : {}),
        ...(input.discipline !== undefined ? { discipline: input.discipline } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
        ...(input.scheduleImpactDays !== undefined ? { scheduleImpactDays: input.scheduleImpactDays } : {}),
        ...(input.costImpactAmount !== undefined ? { costImpactAmount: input.costImpactAmount } : {}),
        ...(input.linkedTaskId !== undefined ? { linkedTaskId: input.linkedTaskId } : {}),
        ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId } : {}),
      },
      include: {
        responses: { orderBy: { createdAt: "asc" } },
      },
    });
  }

  async addResponse(
    orgId: string,
    rfiId: string,
    userId: string,
    responseContent: string,
    isOfficialAnswer = false,
  ): Promise<RfiResponse> {
    return db.rfiResponse.create({
      data: {
        orgId,
        rfiId,
        responseContent,
        isOfficialAnswer,
        respondedById: userId,
      },
    });
  }

  async markAnswered(
    orgId: string,
    rfiId: string,
    userId: string,
    answerContent: string,
  ): Promise<RfiWithDetails> {
    return db.$transaction(async (tx) => {
      await tx.rfiResponse.create({
        data: {
          orgId,
          rfiId,
          responseContent: answerContent,
          isOfficialAnswer: true,
          respondedById: userId,
        },
      });

      return tx.rfi.update({
        where: { id: rfiId, orgId },
        data: {
          status: "ANSWERED",
          answeredById: userId,
          answeredAt: new Date(),
        },
        include: {
          responses: { orderBy: { createdAt: "asc" } },
        },
      });
    });
  }

  async close(
    orgId: string,
    rfiId: string,
    userId: string,
  ): Promise<RfiWithDetails> {
    return db.rfi.update({
      where: { id: rfiId, orgId },
      data: {
        status: "CLOSED",
        closedById: userId,
        closedAt: new Date(),
      },
      include: {
        responses: { orderBy: { createdAt: "asc" } },
      },
    });
  }

  async list(
    orgId: string,
    filters?: RfiFilters,
  ): Promise<{ items: RfiWithDetails[]; total: number }> {
    const where: Prisma.RfiWhereInput = {
      orgId,
      ...(filters?.projectId ? { projectId: filters.projectId } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.discipline ? { discipline: filters.discipline } : {}),
      ...(filters?.priority ? { priority: filters.priority } : {}),
      ...(filters?.assignedToId ? { assignedToId: filters.assignedToId } : {}),
      ...(filters?.requestedById ? { requestedById: filters.requestedById } : {}),
      ...(filters?.search
        ? {
            OR: [
              { title: { contains: filters.search, mode: "insensitive" } },
              { question: { contains: filters.search, mode: "insensitive" } },
              { rfiNumber: { contains: filters.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      db.rfi.findMany({
        where,
        include: {
          responses: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "desc" },
        take: filters?.limit ?? 50,
        skip: filters?.offset ?? 0,
      }),
      db.rfi.count({ where }),
    ]);

    return { items, total };
  }
}

export const rfiRepository = new RfiRepository();
