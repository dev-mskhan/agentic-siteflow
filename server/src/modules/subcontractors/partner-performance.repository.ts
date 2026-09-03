import { Prisma } from "@prisma/client";
import type { PartnerEvaluation, PartnerType } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";

export interface CreatePartnerEvaluationData {
  orgId: string;
  partnerType: PartnerType;
  subcontractorId?: string | null;
  vendorId?: string | null;
  projectId?: string | null;
  qualityRating: number;
  timelinessRating: number;
  communicationRating: number;
  safetyRating?: number | null;
  overallRating: number;
  comments?: string | null;
  evaluatorId: string;
}

export class PartnerPerformanceRepository {
  async findSubcontractor(orgId: string, id: string) {
    return db.subcontractor.findFirst({
      where: { id, orgId },
      select: { id: true, companyName: true, rating: true },
    });
  }

  async findVendor(orgId: string, id: string) {
    return db.vendor.findFirst({
      where: { id, orgId },
      select: { id: true, name: true, rating: true },
    });
  }

  async findProject(orgId: string, id: string) {
    return db.project.findFirst({
      where: { id, orgId },
      select: { id: true },
    });
  }

  async createEvaluation(data: CreatePartnerEvaluationData): Promise<PartnerEvaluation> {
    return db.partnerEvaluation.create({
      data: {
        orgId: data.orgId,
        partnerType: data.partnerType,
        subcontractorId: data.subcontractorId,
        vendorId: data.vendorId,
        projectId: data.projectId,
        qualityRating: data.qualityRating,
        timelinessRating: data.timelinessRating,
        communicationRating: data.communicationRating,
        safetyRating: data.safetyRating,
        overallRating: new Prisma.Decimal(data.overallRating.toFixed(2)),
        comments: data.comments,
        evaluatorId: data.evaluatorId,
      },
    });
  }

  async findByPartner(
    orgId: string,
    partnerType: PartnerType,
    partnerId: string,
  ): Promise<PartnerEvaluation[]> {
    const where: Prisma.PartnerEvaluationWhereInput = {
      orgId,
      partnerType,
      ...(partnerType === "SUBCONTRACTOR" ? { subcontractorId: partnerId } : { vendorId: partnerId }),
    };

    return db.partnerEvaluation.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  async updatePartnerRating(
    orgId: string,
    partnerType: PartnerType,
    partnerId: string,
    newRating: number,
  ): Promise<void> {
    const decimalRating = new Prisma.Decimal(newRating.toFixed(2));
    if (partnerType === "SUBCONTRACTOR") {
      await db.subcontractor.updateMany({
        where: { id: partnerId, orgId },
        data: { rating: decimalRating },
      });
    } else {
      await db.vendor.updateMany({
        where: { id: partnerId, orgId },
        data: { rating: decimalRating },
      });
    }
  }

  async getVendorDeliveries(orgId: string, vendorId: string) {
    return db.delivery.findMany({
      where: {
        orgId,
        purchaseOrder: { vendorId },
      },
      include: {
        receiptItems: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getSubcontractorTasks(orgId: string, subcontractorId: string) {
    return db.task.findMany({
      where: {
        orgId,
        subcontractorId,
      },
      select: {
        id: true,
        status: true,
        plannedStartDate: true,
        plannedEndDate: true,
        actualStartDate: true,
        actualEndDate: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }
}

export const partnerPerformanceRepository = new PartnerPerformanceRepository();
