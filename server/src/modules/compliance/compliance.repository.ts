import type { Prisma, ComplianceRecord } from "@prisma/client";
import { db as defaultDb } from "../../infrastructure/database/client.js";
import type {
  CreateComplianceRecordInput,
  UpdateComplianceRecordInput,
  ComplianceFilters,
} from "./compliance.types.js";

export type ComplianceRecordWithDetails = ComplianceRecord & {
  createdBy: { id: string; firstName: string; lastName: string; email: string };
  responsibleUser: { id: string; firstName: string; lastName: string; email: string } | null;
  project: { id: string; name: string } | null;
  subcontractor: { id: string; companyName: string; trade: string } | null;
};

export class ComplianceRepository {
  constructor(private readonly prisma: typeof defaultDb = defaultDb) {}

  async findProject(orgId: string, projectId: string) {
    return this.prisma.project.findFirst({
      where: { id: projectId, orgId },
      select: { id: true, name: true },
    });
  }

  async findSubcontractor(orgId: string, subId: string) {
    return this.prisma.subcontractor.findFirst({
      where: { id: subId, orgId },
      select: { id: true, companyName: true },
    });
  }

  async create(
    orgId: string,
    userId: string,
    input: CreateComplianceRecordInput,
  ): Promise<ComplianceRecordWithDetails> {
    return this.prisma.complianceRecord.create({
      data: {
        orgId,
        projectId: input.projectId,
        subcontractorId: input.subcontractorId,
        complianceType: input.complianceType,
        title: input.title,
        referenceNumber: input.referenceNumber,
        issuingAuthority: input.issuingAuthority,
        status: input.status ?? "ACTIVE",
        issueDate: input.issueDate,
        expirationDate: input.expirationDate,
        reminderDays: input.reminderDays ?? 30,
        responsibleUserId: input.responsibleUserId,
        notes: input.notes,
        createdById: userId,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        responsibleUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        project: { select: { id: true, name: true } },
        subcontractor: { select: { id: true, companyName: true, trade: true } },
      },
    });
  }

  async findById(orgId: string, id: string): Promise<ComplianceRecordWithDetails | null> {
    return this.prisma.complianceRecord.findFirst({
      where: { id, orgId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        responsibleUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        project: { select: { id: true, name: true } },
        subcontractor: { select: { id: true, companyName: true, trade: true } },
      },
    });
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateComplianceRecordInput,
  ): Promise<ComplianceRecordWithDetails> {
    return this.prisma.complianceRecord.update({
      where: { id },
      data: input,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        responsibleUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        project: { select: { id: true, name: true } },
        subcontractor: { select: { id: true, companyName: true, trade: true } },
      },
    });
  }

  async findExpiring(orgId: string, windowDays = 30): Promise<ComplianceRecordWithDetails[]> {
    const futureLimit = new Date();
    futureLimit.setDate(futureLimit.getDate() + windowDays);

    return this.prisma.complianceRecord.findMany({
      where: {
        orgId,
        status: "ACTIVE",
        expirationDate: {
          not: null,
          lte: futureLimit,
        },
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        responsibleUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        project: { select: { id: true, name: true } },
        subcontractor: { select: { id: true, companyName: true, trade: true } },
      },
      orderBy: { expirationDate: "asc" },
    });
  }

  async list(
    orgId: string,
    filters?: ComplianceFilters,
  ): Promise<{ items: ComplianceRecordWithDetails[]; total: number }> {
    const where: Prisma.ComplianceRecordWhereInput = { orgId };

    if (filters?.projectId) where.projectId = filters.projectId;
    if (filters?.subcontractorId) where.subcontractorId = filters.subcontractorId;
    if (filters?.complianceType) where.complianceType = filters.complianceType;
    if (filters?.status) where.status = filters.status;
    if (filters?.expiringWithinDays !== undefined) {
      const target = new Date();
      target.setDate(target.getDate() + filters.expiringWithinDays);
      where.expirationDate = { not: null, lte: target };
      where.status = "ACTIVE";
    }
    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { referenceNumber: { contains: filters.search, mode: "insensitive" } },
        { issuingAuthority: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.complianceRecord.findMany({
        where,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          responsibleUser: { select: { id: true, firstName: true, lastName: true, email: true } },
          project: { select: { id: true, name: true } },
          subcontractor: { select: { id: true, companyName: true, trade: true } },
        },
        orderBy: { createdAt: "desc" },
        take: filters?.limit ?? 50,
        skip: filters?.offset ?? 0,
      }),
      this.prisma.complianceRecord.count({ where }),
    ]);

    return { items, total };
  }
}

export const complianceRepository = new ComplianceRepository();
