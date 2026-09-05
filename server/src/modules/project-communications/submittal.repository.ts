import type { Prisma, Submittal, SubmittalReview, SubmittalStatus } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type { CreateSubmittalInput, SubmittalFilters } from "./submittal.types.js";

export type SubmittalWithDetails = Submittal & {
  reviews: SubmittalReview[];
};

export class SubmittalRepository {
  async findById(orgId: string, id: string): Promise<SubmittalWithDetails | null> {
    return db.submittal.findFirst({
      where: { id, orgId },
      include: {
        reviews: { orderBy: { reviewedAt: "asc" } },
      },
    });
  }

  async findProject(orgId: string, projectId: string) {
    return db.project.findFirst({
      where: { id: projectId, orgId },
      select: { id: true },
    });
  }

  async findSubcontractor(orgId: string, subcontractorId: string) {
    return db.subcontractor.findFirst({
      where: { id: subcontractorId, orgId },
      select: { id: true },
    });
  }

  async findTask(orgId: string, taskId: string) {
    return db.task.findFirst({
      where: { id: taskId, orgId },
      select: { id: true, projectId: true },
    });
  }

  async getNextSubmittalNumber(projectId: string): Promise<string> {
    const count = await db.submittal.count({
      where: { projectId, revision: 0 },
    });
    const nextNum = count + 1;
    return `SUB-${String(nextNum).padStart(3, "0")}`;
  }

  async create(
    orgId: string,
    userId: string,
    submittalNumber: string,
    input: CreateSubmittalInput,
  ): Promise<SubmittalWithDetails> {
    return db.submittal.create({
      data: {
        orgId,
        projectId: input.projectId,
        submittalNumber,
        revision: 0,
        title: input.title,
        description: input.description ?? null,
        specSection: input.specSection ?? null,
        type: input.type ?? "PRODUCT_DATA",
        status: "SUBMITTED",
        subcontractorId: input.subcontractorId ?? null,
        submittedById: userId,
        leadReviewerId: input.leadReviewerId ?? null,
        dueDate: input.dueDate ?? null,
        requiredOnSiteDate: input.requiredOnSiteDate ?? null,
        linkedTaskId: input.linkedTaskId ?? null,
      },
      include: {
        reviews: { orderBy: { reviewedAt: "asc" } },
      },
    });
  }

  async createRevision(
    orgId: string,
    userId: string,
    previous: Submittal,
    overrides?: Partial<CreateSubmittalInput>,
  ): Promise<SubmittalWithDetails> {
    const nextRevision = previous.revision + 1;
    return db.submittal.create({
      data: {
        orgId,
        projectId: previous.projectId,
        submittalNumber: previous.submittalNumber,
        revision: nextRevision,
        title: overrides?.title ?? previous.title,
        description: overrides?.description ?? previous.description,
        specSection: overrides?.specSection ?? previous.specSection,
        type: overrides?.type ?? previous.type,
        status: "SUBMITTED",
        subcontractorId: overrides?.subcontractorId ?? previous.subcontractorId,
        submittedById: userId,
        leadReviewerId: overrides?.leadReviewerId ?? previous.leadReviewerId,
        dueDate: overrides?.dueDate ?? previous.dueDate,
        requiredOnSiteDate: overrides?.requiredOnSiteDate ?? previous.requiredOnSiteDate,
        linkedTaskId: overrides?.linkedTaskId ?? previous.linkedTaskId,
      },
      include: {
        reviews: { orderBy: { reviewedAt: "asc" } },
      },
    });
  }

  async addReview(
    orgId: string,
    submittalId: string,
    reviewerId: string,
    status: SubmittalStatus,
    comments?: string,
  ): Promise<SubmittalWithDetails> {
    return db.$transaction(async (tx) => {
      await tx.submittalReview.create({
        data: {
          orgId,
          submittalId,
          reviewerId,
          status,
          comments: comments ?? null,
        },
      });

      return tx.submittal.update({
        where: { id: submittalId, orgId },
        data: { status },
        include: {
          reviews: { orderBy: { reviewedAt: "asc" } },
        },
      });
    });
  }

  async list(
    orgId: string,
    filters?: SubmittalFilters,
  ): Promise<{ items: SubmittalWithDetails[]; total: number }> {
    const where: Prisma.SubmittalWhereInput = {
      orgId,
      ...(filters?.projectId ? { projectId: filters.projectId } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.type ? { type: filters.type } : {}),
      ...(filters?.subcontractorId ? { subcontractorId: filters.subcontractorId } : {}),
      ...(filters?.leadReviewerId ? { leadReviewerId: filters.leadReviewerId } : {}),
      ...(filters?.submittedById ? { submittedById: filters.submittedById } : {}),
      ...(filters?.specSection ? { specSection: { contains: filters.specSection, mode: "insensitive" } } : {}),
      ...(filters?.search
        ? {
            OR: [
              { title: { contains: filters.search, mode: "insensitive" } },
              { description: { contains: filters.search, mode: "insensitive" } },
              { submittalNumber: { contains: filters.search, mode: "insensitive" } },
              { specSection: { contains: filters.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      db.submittal.findMany({
        where,
        include: {
          reviews: { orderBy: { reviewedAt: "asc" } },
        },
        orderBy: [{ submittalNumber: "desc" }, { revision: "desc" }],
        take: filters?.limit ?? 50,
        skip: filters?.offset ?? 0,
      }),
      db.submittal.count({ where }),
    ]);

    return { items, total };
  }
}

export const submittalRepository = new SubmittalRepository();
