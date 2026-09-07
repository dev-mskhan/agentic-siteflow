import { Prisma, SovStatus, SovType, type ScheduleOfValues } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type { CreateSovInput, SovDetail } from "./sov.types.js";

export class SovRepository {
  async create(
    orgId: string,
    createdById: string,
    input: CreateSovInput,
  ): Promise<SovDetail> {
    return db.$transaction(async (tx) => {
      let totalScheduledValue = new Prisma.Decimal(0);
      const itemsData = input.items.map((item) => {
        const val = new Prisma.Decimal(item.scheduledValue);
        totalScheduledValue = totalScheduledValue.add(val);
        return {
          orgId,
          itemNumber: item.itemNumber,
          description: item.description,
          costCodeId: item.costCodeId,
          scheduledValue: val,
        };
      });

      const sov = await tx.scheduleOfValues.create({
        data: {
          orgId,
          projectId: input.projectId,
          contractId: input.contractId,
          subcontractorId: input.subcontractorId,
          type: input.type ?? SovType.PRIME_CONTRACT,
          status: SovStatus.DRAFT,
          title: input.title,
          totalScheduledValue,
          createdById,
          items: {
            create: itemsData,
          },
        },
        include: {
          items: {
            include: {
              costCode: {
                select: { id: true, code: true, name: true },
              },
            },
          },
          contract: {
            select: { id: true, contractNumber: true, contractValue: true },
          },
          subcontractor: {
            select: { id: true, companyName: true },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      return sov;
    });
  }

  async findById(orgId: string, id: string): Promise<SovDetail | null> {
    return db.scheduleOfValues.findFirst({
      where: { id, orgId },
      include: {
        items: {
          include: {
            costCode: {
              select: { id: true, code: true, name: true },
            },
          },
          orderBy: { itemNumber: "asc" },
        },
        contract: {
          select: { id: true, contractNumber: true, contractValue: true },
        },
        subcontractor: {
          select: { id: true, companyName: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  async listByProject(orgId: string, projectId: string): Promise<SovDetail[]> {
    return db.scheduleOfValues.findMany({
      where: { orgId, projectId },
      include: {
        items: {
          include: {
            costCode: {
              select: { id: true, code: true, name: true },
            },
          },
          orderBy: { itemNumber: "asc" },
        },
        contract: {
          select: { id: true, contractNumber: true, contractValue: true },
        },
        subcontractor: {
          select: { id: true, companyName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async activate(orgId: string, id: string): Promise<ScheduleOfValues> {
    return db.$transaction(async (tx) => {
      const sov = await tx.scheduleOfValues.findFirst({
        where: { id, orgId },
      });
      if (!sov) {
        throw new Error("SOV not found");
      }

      // Mark any existing active SOVs for the same project & contract as SUPERSEDED
      await tx.scheduleOfValues.updateMany({
        where: {
          orgId,
          projectId: sov.projectId,
          contractId: sov.contractId,
          status: SovStatus.ACTIVE,
        },
        data: { status: SovStatus.SUPERSEDED },
      });

      return tx.scheduleOfValues.update({
        where: { id },
        data: { status: SovStatus.ACTIVE },
      });
    });
  }
}

export const sovRepository = new SovRepository();
