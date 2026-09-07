import { PaymentStatus, Prisma, type Payment } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type { RecordPaymentInput } from "./invoice.types.js";

export class PaymentRepository {
  async getNextPaymentNumber(orgId: string, tx?: Prisma.TransactionClient): Promise<string> {
    const client = tx ?? db;
    const count = await client.payment.count({
      where: { orgId },
    });
    const seq = (count + 1).toString().padStart(4, "0");
    return `PAY-${seq}`;
  }

  async create(
    orgId: string,
    recordedById: string,
    input: RecordPaymentInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Payment> {
    const client = tx ?? db;
    const paymentNumber = await this.getNextPaymentNumber(orgId, tx);

    return client.payment.create({
      data: {
        orgId,
        invoiceId: input.invoiceId,
        paymentNumber,
        amount: new Prisma.Decimal(input.amount),
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber,
        status: PaymentStatus.COMPLETED,
        notes: input.notes,
        recordedById,
      },
    });
  }

  async listByInvoice(orgId: string, invoiceId: string): Promise<Payment[]> {
    return db.payment.findMany({
      where: { orgId, invoiceId },
      orderBy: { paymentDate: "desc" },
    });
  }

  async listByOrg(orgId: string, limit = 50, offset = 0): Promise<Payment[]> {
    return db.payment.findMany({
      where: { orgId },
      orderBy: { paymentDate: "desc" },
      take: limit,
      skip: offset,
    });
  }
}

export const paymentRepository = new PaymentRepository();
