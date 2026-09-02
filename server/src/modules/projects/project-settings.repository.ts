import { db } from "../../infrastructure/database/client.js";
import type { Prisma } from "@prisma/client";

export interface UpdateProjectSettingsInput {
  currency?: string;
  currencySymbol?: string;
  timezone?: string;
  dateFormat?: string;
  unitSystem?: string;
  country?: string;
  taxRate?: number;
  taxLabel?: string;
  retainagePercent?: number;
  paymentTermsDays?: number;
  requireChangeOrderApproval?: boolean;
  requirePaymentApproval?: boolean;
  customFields?: Record<string, unknown>;
}

function toCreateData(projectId: string, data?: UpdateProjectSettingsInput) {
  const { customFields, ...rest } = data ?? {};
  return {
    projectId,
    ...rest,
    ...(customFields !== undefined
      ? { customFields: customFields as Prisma.InputJsonValue }
      : {}),
  };
}

function toUpdateData(data: UpdateProjectSettingsInput) {
  const { customFields, ...rest } = data;
  return {
    ...rest,
    ...(customFields !== undefined
      ? { customFields: customFields as Prisma.InputJsonValue }
      : {}),
  };
}

export class ProjectSettingsRepository {
  async findByProject(projectId: string) {
    return db.projectSettings.findUnique({ where: { projectId } });
  }

  async create(projectId: string, data?: UpdateProjectSettingsInput) {
    return db.projectSettings.create({ data: toCreateData(projectId, data) });
  }

  async upsert(projectId: string, data: UpdateProjectSettingsInput) {
    return db.projectSettings.upsert({
      where: { projectId },
      create: toCreateData(projectId, data),
      update: toUpdateData(data),
    });
  }
}

export const projectSettingsRepository = new ProjectSettingsRepository();
