import {
  PaymentApplicationStatus,
  PaymentApplicationType,
  Prisma,
  type PaymentApplication,
} from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type {
  CreatePaymentApplicationInput,
  PaymentApplicationDetail,
  PaymentApplicationFilters,
} from "./payment-application.types.js";

export class PaymentApplicationRepository {
  async getLatestApprovedApp(
    orgId: string,
    projectId: string,
    sovId: string,
    subcontractorId?: string | null,
  ): Promise<PaymentApplicationDetail | null> {
    return db.paymentApplication.findFirst({
      where: {
        orgId,
        projectId,
        sovId,
        subcontractorId: subcontractorId ?? null,
        status: { in: [PaymentApplicationStatus.APPROVED, PaymentApplicationStatus.PAID] },
      },
      orderBy: { applicationNumber: "desc" },
      include: {
        lineItems: true,
      },
    });
  }

  async getNextApplicationNumber(
    projectId: string,
    type: PaymentApplicationType,
    subcontractorId?: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? db;
    const count = await client.paymentApplication.count({
      where: {
        projectId,
        type,
        subcontractorId: subcontractorId ?? null,
      },
    });
    return count + 1;
  }

  async create(
    orgId: string,
    submittedById: string,
    input: CreatePaymentApplicationInput,
    previousApp: PaymentApplicationDetail | null,
  ): Promise<PaymentApplicationDetail> {
    return db.$transaction(async (tx) => {
      const applicationNumber = await this.getNextApplicationNumber(
        input.projectId,
        input.type ?? PaymentApplicationType.CLIENT,
        input.subcontractorId,
        tx,
      );

      // Fetch SOV with items and project/contract value
      const sov = await tx.scheduleOfValues.findUnique({
        where: { id: input.sovId },
        include: { items: true },
      });
      if (!sov) {
        throw new Error("Schedule of values not found");
      }

      const sovItemsMap = new Map(sov.items.map((it) => [it.id, it]));

      // Map previous app's line items by sovItemId
      const previousLineItemMap = new Map<string, Prisma.Decimal>();
      if (previousApp) {
        for (const li of previousApp.lineItems) {
          previousLineItemMap.set(li.sovItemId, li.totalCompletedAndStored);
        }
      }

      const retainagePct = new Prisma.Decimal(input.retainagePercent ?? 0.1);

      let totalCompletedAndStoredSum = new Prisma.Decimal(0);
      let retainageWithheldSum = new Prisma.Decimal(0);

      const lineItemsData = input.lineItems.map((liInput) => {
        const sovItem = sovItemsMap.get(liInput.sovItemId);
        if (!sovItem) {
          throw new Error(`SOV item ${liInput.sovItemId} does not exist`);
        }

        const prevCompleted = previousLineItemMap.get(liInput.sovItemId) ?? new Prisma.Decimal(0);
        const thisPeriod = new Prisma.Decimal(liInput.workCompletedThisPeriod);
        const stored = new Prisma.Decimal(liInput.materialsPresentlyStored ?? 0);
        const totalLineCompleted = prevCompleted.add(thisPeriod).add(stored);

        const scheduledVal = sovItem.scheduledValue;
        const balanceToFinish = scheduledVal.sub(totalLineCompleted);
        const percentComplete = scheduledVal.isZero()
          ? new Prisma.Decimal(0)
          : totalLineCompleted.div(scheduledVal);

        const retainageLineWithheld = totalLineCompleted.mul(retainagePct);

        totalCompletedAndStoredSum = totalCompletedAndStoredSum.add(totalLineCompleted);
        retainageWithheldSum = retainageWithheldSum.add(retainageLineWithheld);

        return {
          orgId,
          sovItemId: liInput.sovItemId,
          workCompletedPrevious: prevCompleted,
          workCompletedThisPeriod: thisPeriod,
          materialsPresentlyStored: stored,
          totalCompletedAndStored: totalLineCompleted,
          percentComplete,
          balanceToFinish,
          retainageWithheld: retainageLineWithheld,
        };
      });

      // Calculate G702 Header amounts
      const originalContractSum = sov.totalScheduledValue;
      const netChangeByChangeOrders = new Prisma.Decimal(0);
      const contractSumToDate = originalContractSum.add(netChangeByChangeOrders);
      const totalEarnedLessRetainage = totalCompletedAndStoredSum.sub(retainageWithheldSum);

      const lessPreviousCertificates = previousApp
        ? previousApp.totalEarnedLessRetainage
        : new Prisma.Decimal(0);

      const currentPaymentDue = totalEarnedLessRetainage.sub(lessPreviousCertificates);
      const balanceToFinish = contractSumToDate.sub(totalEarnedLessRetainage);

      const app = await tx.paymentApplication.create({
        data: {
          orgId,
          projectId: input.projectId,
          sovId: input.sovId,
          applicationNumber,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          type: input.type ?? PaymentApplicationType.CLIENT,
          status: PaymentApplicationStatus.DRAFT,
          subcontractorId: input.subcontractorId,
          contractId: input.contractId,
          originalContractSum,
          netChangeByChangeOrders,
          contractSumToDate,
          totalCompletedAndStored: totalCompletedAndStoredSum,
          retainagePercent: retainagePct,
          retainageAmount: retainageWithheldSum,
          totalEarnedLessRetainage,
          lessPreviousCertificates,
          currentPaymentDue,
          balanceToFinish,
          submittedById,
          lineItems: {
            create: lineItemsData,
          },
        },
        include: {
          lineItems: {
            include: {
              sovItem: {
                select: { id: true, itemNumber: true, description: true, scheduledValue: true },
              },
            },
          },
          sov: {
            select: { id: true, title: true, totalScheduledValue: true },
          },
          submittedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      return app;
    });
  }

  async findById(orgId: string, id: string): Promise<PaymentApplicationDetail | null> {
    return db.paymentApplication.findFirst({
      where: { id, orgId },
      include: {
        lineItems: {
          include: {
            sovItem: {
              select: { id: true, itemNumber: true, description: true, scheduledValue: true },
            },
          },
        },
        sov: {
          select: { id: true, title: true, totalScheduledValue: true },
        },
        submittedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  async list(
    orgId: string,
    filters: PaymentApplicationFilters = {},
  ): Promise<PaymentApplicationDetail[]> {
    const { projectId, sovId, status, type, subcontractorId, limit = 50, offset = 0 } = filters;

    return db.paymentApplication.findMany({
      where: {
        orgId,
        ...(projectId && { projectId }),
        ...(sovId && { sovId }),
        ...(status && { status }),
        ...(type && { type }),
        ...(subcontractorId && { subcontractorId }),
      },
      include: {
        lineItems: {
          include: {
            sovItem: {
              select: { id: true, itemNumber: true, description: true, scheduledValue: true },
            },
          },
        },
        submittedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { applicationNumber: "desc" },
      take: limit,
      skip: offset,
    });
  }

  async updateStatus(
    id: string,
    data: Prisma.PaymentApplicationUpdateInput,
  ): Promise<PaymentApplication> {
    return db.paymentApplication.update({
      where: { id },
      data,
    });
  }
}

export const paymentApplicationRepository = new PaymentApplicationRepository();
