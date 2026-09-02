import { db } from "../../infrastructure/database/client.js";
import type { Prisma } from "@prisma/client";

export class EstimateVersionRepository {
  async create(data: {
    estimateId: string;
    orgId: string;
    version: number;
    snapshot: Prisma.InputJsonValue;
    changeNote?: string;
    createdById: string;
  }) {
    return db.estimateVersion.create({ data });
  }

  async findByEstimate(estimateId: string) {
    return db.estimateVersion.findMany({
      where: { estimateId },
      orderBy: { version: "desc" },
    });
  }

  async findByVersion(estimateId: string, version: number) {
    return db.estimateVersion.findUnique({
      where: { estimateId_version: { estimateId, version } },
    });
  }

  async findLatest(estimateId: string) {
    return db.estimateVersion.findFirst({
      where: { estimateId },
      orderBy: { version: "desc" },
    });
  }
}

export const estimateVersionRepository = new EstimateVersionRepository();
