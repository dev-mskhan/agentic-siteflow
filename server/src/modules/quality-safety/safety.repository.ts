import type { Prisma, SafetyIncident, SafetyCorrectiveAction } from "@prisma/client";
import { db as defaultDb } from "../../infrastructure/database/client.js";
import type {
  ReportSafetyIncidentInput,
  UpdateSafetyInvestigationInput,
  AddCorrectiveActionInput,
  SafetyFilters,
} from "./safety.types.js";

export type SafetyIncidentWithDetails = SafetyIncident & {
  reportedBy: { id: string; firstName: string; lastName: string; email: string };
  investigatedBy: { id: string; firstName: string; lastName: string; email: string } | null;
  subcontractor: { id: string; companyName: string; trade: string } | null;
  correctiveActions: (SafetyCorrectiveAction & {
    assignedTo: { id: string; firstName: string; lastName: string; email: string };
  })[];
};

export class SafetyRepository {
  constructor(private readonly prisma: typeof defaultDb = defaultDb) {}

  async findProject(orgId: string, projectId: string) {
    return this.prisma.project.findFirst({
      where: { id: projectId, orgId },
      select: { id: true, name: true, status: true },
    });
  }

  async findSubcontractor(orgId: string, subId: string) {
    return this.prisma.subcontractor.findFirst({
      where: { id: subId, orgId },
      select: { id: true, companyName: true },
    });
  }

  async getNextIncidentNumber(projectId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.safetyIncident.count({
      where: { projectId },
    });
    return `SAF-${year}-${String(count + 1).padStart(3, "0")}`;
  }

  async createIncident(
    orgId: string,
    userId: string,
    incidentNumber: string,
    input: ReportSafetyIncidentInput,
  ): Promise<SafetyIncidentWithDetails> {
    return this.prisma.safetyIncident.create({
      data: {
        orgId,
        projectId: input.projectId,
        incidentNumber,
        incidentDate: input.incidentDate,
        incidentType: input.incidentType,
        severity: input.severity ?? "MEDIUM",
        title: input.title,
        description: input.description,
        location: input.location,
        isOshaRecordable: input.isOshaRecordable ?? false,
        oshaForm300Category: input.oshaForm300Category,
        lostWorkDays: input.lostWorkDays ?? 0,
        restrictedWorkDays: input.restrictedWorkDays ?? 0,
        affectedPersonName: input.affectedPersonName,
        affectedPersonType: input.affectedPersonType,
        subcontractorId: input.subcontractorId,
        reportedById: userId,
      },
      include: {
        reportedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        investigatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        subcontractor: { select: { id: true, companyName: true, trade: true } },
        correctiveActions: {
          include: {
            assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });
  }

  async findIncidentById(orgId: string, id: string): Promise<SafetyIncidentWithDetails | null> {
    return this.prisma.safetyIncident.findFirst({
      where: { id, orgId },
      include: {
        reportedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        investigatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        subcontractor: { select: { id: true, companyName: true, trade: true } },
        correctiveActions: {
          include: {
            assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });
  }

  async updateInvestigation(
    orgId: string,
    input: UpdateSafetyInvestigationInput,
    userId: string,
  ): Promise<SafetyIncidentWithDetails> {
    const data: Prisma.SafetyIncidentUpdateInput = {
      investigationSummary: input.investigationSummary,
      rootCause: input.rootCause,
      investigatedBy: { connect: { id: input.investigatedById ?? userId } },
      status: input.closeIncident ? "CLOSED" : input.status ?? "UNDER_INVESTIGATION",
    };

    if (input.closeIncident) {
      data.closedAt = new Date();
    }

    return this.prisma.safetyIncident.update({
      where: { id: input.incidentId },
      data,
      include: {
        reportedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        investigatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        subcontractor: { select: { id: true, companyName: true, trade: true } },
        correctiveActions: {
          include: {
            assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });
  }

  async addCorrectiveAction(
    orgId: string,
    input: AddCorrectiveActionInput,
  ): Promise<SafetyCorrectiveAction & { assignedTo: { id: string; firstName: string; lastName: string; email: string } }> {
    return this.prisma.safetyCorrectiveAction.create({
      data: {
        orgId,
        incidentId: input.incidentId,
        actionDescription: input.actionDescription,
        assignedToId: input.assignedToId,
        dueDate: input.dueDate,
      },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async findCorrectiveActionById(orgId: string, id: string) {
    return this.prisma.safetyCorrectiveAction.findFirst({
      where: { id, orgId },
    });
  }

  async completeCorrectiveAction(
    orgId: string,
    id: string,
    verificationNotes?: string,
  ): Promise<SafetyCorrectiveAction> {
    return this.prisma.safetyCorrectiveAction.update({
      where: { id },
      data: {
        isCompleted: true,
        completedDate: new Date(),
        verificationNotes,
      },
    });
  }

  async listIncidents(
    orgId: string,
    filters?: SafetyFilters,
  ): Promise<{ items: SafetyIncidentWithDetails[]; total: number }> {
    const where: Prisma.SafetyIncidentWhereInput = { orgId };

    if (filters?.projectId) where.projectId = filters.projectId;
    if (filters?.incidentType) where.incidentType = filters.incidentType;
    if (filters?.severity) where.severity = filters.severity;
    if (filters?.status) where.status = filters.status;
    if (filters?.isOshaRecordable !== undefined) where.isOshaRecordable = filters.isOshaRecordable;
    if (filters?.subcontractorId) where.subcontractorId = filters.subcontractorId;
    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { incidentNumber: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.safetyIncident.findMany({
        where,
        include: {
          reportedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          investigatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          subcontractor: { select: { id: true, companyName: true, trade: true } },
          correctiveActions: {
            include: {
              assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
        },
        orderBy: { incidentDate: "desc" },
        take: filters?.limit ?? 50,
        skip: filters?.offset ?? 0,
      }),
      this.prisma.safetyIncident.count({ where }),
    ]);

    return { items, total };
  }
}

export const safetyRepository = new SafetyRepository();
