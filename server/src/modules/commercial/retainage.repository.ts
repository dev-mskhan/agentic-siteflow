import { PaymentApplicationStatus, Prisma, RetainageReleaseStatus, type RetainageRelease } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type {
  RequestRetainageReleaseInput,
  RetainageReleaseDetail,
  RetainageSummary,
} from "./retainage.types.js";

export class RetainageRepository {
  async getNextReleaseNumber(projectId: string, tx?: Prisma.TransactionClient): Promise<string> {
    const client = tx ?? db;
    const count = await client.retainageRelease.count({
      where: { projectId },
    });
    const seq = (count + 1).toString().padStart(4, "0");
    return `RET-${seq}`;
  }

  async getRetainageBalance(
    orgId: string,
    projectId: string,
    subcontractorId?: string,
    contractId?: string,
  ): Promise<RetainageSummary> {
    // Sum retainage withheld from approved/paid payment applications
    const apps = await db.paymentApplication.findMany({
      where: {
        orgId,
        projectId,
        ...(subcontractorId && { subcontractorId }),
        ...(contractId && { contractId }),
        status: { in: [PaymentApplicationStatus.APPROVED, PaymentApplicationStatus.PAID] },
      },
      select: {
        retainageAmount: true,
      },
    });

    let totalWithheld = new Prisma.Decimal(0);
    for (const app of apps) {
      totalWithheld = totalWithheld.add(app.retainageAmount);
    }

    // Sum already released retainage
    const releases = await db.retainageRelease.findMany({
      where: {
        orgId,
        projectId,
        ...(subcontractorId && { subcontractorId }),
        ...(contractId && { contractId }),
        status: { in: [RetainageReleaseStatus.APPROVED, RetainageReleaseStatus.RELEASED] },
      },
      select: {
        amountToRelease: true,
      },
    });

    let totalReleased = new Prisma.Decimal(0);
    for (const rel of releases) {
      totalReleased = totalReleased.add(rel.amountToRelease);
    }

    const currentHeld = totalWithheld.sub(totalReleased);

    return {
      projectId,
      subcontractorId: subcontractorId ?? null,
      contractId: contractId ?? null,
      totalWithheld: Number(totalWithheld),
      totalReleased: Number(totalReleased),
      currentRetainageHeld: Math.max(0, Number(currentHeld)),
    };
  }

  async create(
    orgId: string,
    requestedById: string,
    input: RequestRetainageReleaseInput,
    totalWithheld: number,
  ): Promise<RetainageRelease> {
    const amt = new Prisma.Decimal(input.amountToRelease);
    const withheld = new Prisma.Decimal(totalWithheld);
    const remaining = withheld.sub(amt);

    // Wrap release-number generation and insert in a single transaction with
    // RepeatableRead so concurrent requests cannot observe a stale count and
    // produce duplicate release numbers.
    return db.$transaction(
      async (tx) => {
        const releaseNumber = await this.getNextReleaseNumber(input.projectId, tx);
        return tx.retainageRelease.create({
          data: {
            orgId,
            projectId: input.projectId,
            subcontractorId: input.subcontractorId,
            contractId: input.contractId,
            releaseNumber,
            totalWithheld: withheld,
            amountToRelease: amt,
            remainingRetainage: remaining,
            status: RetainageReleaseStatus.REQUESTED,
            notes: input.notes,
            requestedById,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async findById(orgId: string, id: string): Promise<RetainageReleaseDetail | null> {
    return db.retainageRelease.findFirst({
      where: { id, orgId },
      include: {
        subcontractor: {
          select: { id: true, companyName: true },
        },
        contract: {
          select: { id: true, contractNumber: true },
        },
        requestedBy: {
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
    projectId: string,
    subcontractorId?: string,
  ): Promise<RetainageReleaseDetail[]> {
    return db.retainageRelease.findMany({
      where: {
        orgId,
        projectId,
        ...(subcontractorId && { subcontractorId }),
      },
      include: {
        subcontractor: {
          select: { id: true, companyName: true },
        },
        contract: {
          select: { id: true, contractNumber: true },
        },
        requestedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateStatus(
    id: string,
    data: Prisma.RetainageReleaseUpdateInput,
  ): Promise<RetainageRelease> {
    return db.retainageRelease.update({
      where: { id },
      data,
    });
  }
}

export const retainageRepository = new RetainageRepository();
