import type { Prisma, QualityInspection, Deficiency, DeficiencyStatus } from "@prisma/client";
import { db as defaultDb } from "../../infrastructure/database/client.js";
import type {
  CreateQualityInspectionInput,
  RecordInspectionResultInput,
  CreateDeficiencyInput,
  QualityFilters,
  DeficiencyFilters,
} from "./quality.types.js";

export type QualityInspectionWithDetails = QualityInspection & {
  inspector: { id: string; firstName: string; lastName: string; email: string };
  deficiencies: Deficiency[];
};

export type DeficiencyWithDetails = Deficiency & {
  createdBy: { id: string; firstName: string; lastName: string; email: string };
  assignedTo: { id: string; firstName: string; lastName: string; email: string } | null;
  resolvedBy: { id: string; firstName: string; lastName: string; email: string } | null;
  subcontractor: { id: string; companyName: string; trade: string } | null;
};

export class QualityRepository {
  constructor(private readonly prisma: typeof defaultDb = defaultDb) {}

  async findProject(orgId: string, projectId: string) {
    return this.prisma.project.findFirst({
      where: { id: projectId, orgId },
      select: { id: true, name: true, status: true },
    });
  }

  async findTask(orgId: string, taskId: string) {
    return this.prisma.task.findFirst({
      where: { id: taskId, orgId },
      select: { id: true, projectId: true },
    });
  }

  async findSubcontractor(orgId: string, subId: string) {
    return this.prisma.subcontractor.findFirst({
      where: { id: subId, orgId },
      select: { id: true, companyName: true },
    });
  }

  async getNextInspectionNumber(projectId: string): Promise<string> {
    const count = await this.prisma.qualityInspection.count({
      where: { projectId },
    });
    return `QI-${String(count + 1).padStart(3, "0")}`;
  }

  async getNextDeficiencyNumber(projectId: string): Promise<string> {
    const count = await this.prisma.deficiency.count({
      where: { projectId },
    });
    return `DEF-${String(count + 1).padStart(3, "0")}`;
  }

  async createInspection(
    orgId: string,
    inspectionNumber: string,
    input: CreateQualityInspectionInput,
  ): Promise<QualityInspectionWithDetails> {
    return this.prisma.qualityInspection.create({
      data: {
        orgId,
        projectId: input.projectId,
        inspectionNumber,
        title: input.title,
        description: input.description,
        location: input.location,
        scheduledDate: input.scheduledDate,
        inspectorId: input.inspectorId,
        linkedTaskId: input.linkedTaskId,
        checklistItems: (input.checklistItems ?? []) as unknown as Prisma.InputJsonValue,
        notes: input.notes,
      },
      include: {
        inspector: { select: { id: true, firstName: true, lastName: true, email: true } },
        deficiencies: true,
      },
    });
  }

  async findInspectionById(orgId: string, id: string): Promise<QualityInspectionWithDetails | null> {
    return this.prisma.qualityInspection.findFirst({
      where: { id, orgId },
      include: {
        inspector: { select: { id: true, firstName: true, lastName: true, email: true } },
        deficiencies: true,
      },
    });
  }

  async recordInspectionResults(
    orgId: string,
    input: RecordInspectionResultInput,
  ): Promise<QualityInspectionWithDetails> {
    const data: Prisma.QualityInspectionUpdateInput = {
      status: input.status,
      completedDate: input.completedDate ?? new Date(),
    };
    if (input.notes !== undefined) {
      data.notes = input.notes;
    }
    if (input.checklistItems !== undefined) {
      data.checklistItems = input.checklistItems as unknown as Prisma.InputJsonValue;
    }

    return this.prisma.qualityInspection.update({
      where: { id: input.inspectionId },
      data,
      include: {
        inspector: { select: { id: true, firstName: true, lastName: true, email: true } },
        deficiencies: true,
      },
    });
  }

  async listInspections(
    orgId: string,
    filters?: QualityFilters,
  ): Promise<{ items: QualityInspectionWithDetails[]; total: number }> {
    const where: Prisma.QualityInspectionWhereInput = { orgId };

    if (filters?.projectId) where.projectId = filters.projectId;
    if (filters?.status) where.status = filters.status;
    if (filters?.inspectorId) where.inspectorId = filters.inspectorId;
    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { inspectionNumber: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.qualityInspection.findMany({
        where,
        include: {
          inspector: { select: { id: true, firstName: true, lastName: true, email: true } },
          deficiencies: true,
        },
        orderBy: { scheduledDate: "desc" },
        take: filters?.limit ?? 50,
        skip: filters?.offset ?? 0,
      }),
      this.prisma.qualityInspection.count({ where }),
    ]);

    return { items, total };
  }

  async createDeficiency(
    orgId: string,
    userId: string,
    deficiencyNumber: string,
    input: CreateDeficiencyInput,
  ): Promise<DeficiencyWithDetails> {
    return this.prisma.deficiency.create({
      data: {
        orgId,
        projectId: input.projectId,
        inspectionId: input.inspectionId,
        deficiencyNumber,
        title: input.title,
        description: input.description,
        location: input.location,
        severity: input.severity ?? "MODERATE",
        subcontractorId: input.subcontractorId,
        assignedToId: input.assignedToId,
        dueDate: input.dueDate,
        createdById: userId,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        resolvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        subcontractor: { select: { id: true, companyName: true, trade: true } },
      },
    });
  }

  async findDeficiencyById(orgId: string, id: string): Promise<DeficiencyWithDetails | null> {
    return this.prisma.deficiency.findFirst({
      where: { id, orgId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        resolvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        subcontractor: { select: { id: true, companyName: true, trade: true } },
      },
    });
  }

  async resolveDeficiency(
    orgId: string,
    id: string,
    userId: string,
    correctiveAction: string,
    status: DeficiencyStatus = "RESOLVED",
  ): Promise<DeficiencyWithDetails> {
    return this.prisma.deficiency.update({
      where: { id },
      data: {
        correctiveAction,
        status,
        resolvedAt: new Date(),
        resolvedById: userId,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        resolvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        subcontractor: { select: { id: true, companyName: true, trade: true } },
      },
    });
  }

  async listDeficiencies(
    orgId: string,
    filters?: DeficiencyFilters,
  ): Promise<{ items: DeficiencyWithDetails[]; total: number }> {
    const where: Prisma.DeficiencyWhereInput = { orgId };

    if (filters?.projectId) where.projectId = filters.projectId;
    if (filters?.inspectionId) where.inspectionId = filters.inspectionId;
    if (filters?.status) where.status = filters.status;
    if (filters?.severity) where.severity = filters.severity;
    if (filters?.subcontractorId) where.subcontractorId = filters.subcontractorId;
    if (filters?.assignedToId) where.assignedToId = filters.assignedToId;
    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { deficiencyNumber: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.deficiency.findMany({
        where,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
          resolvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          subcontractor: { select: { id: true, companyName: true, trade: true } },
        },
        orderBy: { createdAt: "desc" },
        take: filters?.limit ?? 50,
        skip: filters?.offset ?? 0,
      }),
      this.prisma.deficiency.count({ where }),
    ]);

    return { items, total };
  }
}

export const qualityRepository = new QualityRepository();
