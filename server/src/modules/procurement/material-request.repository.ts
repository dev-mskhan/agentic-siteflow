import type { MaterialRequest, MaterialRequestItem } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type {
  CreateMaterialRequestInput,
  CreateMaterialRequestItemInput,
  MaterialRequestFilters,
} from "./material-request.types.js";

export type MaterialRequestWithItems = MaterialRequest & {
  items: MaterialRequestItem[];
};

export class MaterialRequestRepository {
  async create(
    orgId: string,
    projectId: string,
    requestedById: string,
    requestNumber: string,
    input: CreateMaterialRequestInput,
  ): Promise<MaterialRequestWithItems> {
    return db.$transaction(async (tx) => {
      const request = await tx.materialRequest.create({
        data: {
          orgId,
          projectId,
          requestedById,
          requestNumber,
          title: input.title,
          priority: input.priority ?? "MEDIUM",
          neededByDate: input.neededByDate,
          deliveryLocation: input.deliveryLocation,
          notes: input.notes,
        },
      });

      const items: MaterialRequestItem[] = [];
      for (const itemInput of input.items) {
        const item = await tx.materialRequestItem.create({
          data: {
            requestId: request.id,
            materialId: itemInput.materialId,
            description: itemInput.description,
            quantity: itemInput.quantity,
            unit: itemInput.unit,
            estimatedUnitCost: itemInput.estimatedUnitCost,
            costCodeId: itemInput.costCodeId,
            linkedTaskId: itemInput.linkedTaskId,
            linkedBoqItemId: itemInput.linkedBoqItemId,
          },
        });
        items.push(item);
      }

      return { ...request, items };
    });
  }

  async findById(orgId: string, id: string): Promise<MaterialRequestWithItems | null> {
    return db.materialRequest.findFirst({
      where: { id, orgId },
      include: { items: true },
    });
  }

  async findByProject(
    orgId: string,
    projectId: string,
    filters: MaterialRequestFilters = {},
  ): Promise<MaterialRequest[]> {
    const { status, priority, search, limit = 50, offset = 0 } = filters;

    return db.materialRequest.findMany({
      where: {
        orgId,
        projectId,
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { requestNumber: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  async update(
    orgId: string,
    id: string,
    data: Partial<Pick<MaterialRequest, "status" | "approvedById" | "approvedAt" | "rejectionReason">>,
  ): Promise<MaterialRequestWithItems> {
    const updated = await db.materialRequest.update({
      where: { id, orgId },
      data,
      include: { items: true },
    });
    return updated;
  }

  async addItem(
    requestId: string,
    input: CreateMaterialRequestItemInput,
  ): Promise<MaterialRequestItem> {
    return db.materialRequestItem.create({
      data: {
        requestId,
        materialId: input.materialId,
        description: input.description,
        quantity: input.quantity,
        unit: input.unit,
        estimatedUnitCost: input.estimatedUnitCost,
        costCodeId: input.costCodeId,
        linkedTaskId: input.linkedTaskId,
        linkedBoqItemId: input.linkedBoqItemId,
      },
    });
  }

  async removeItem(requestId: string, itemId: string): Promise<void> {
    await db.materialRequestItem.deleteMany({
      where: { id: itemId, requestId },
    });
  }

  async countByOrg(orgId: string): Promise<number> {
    return db.materialRequest.count({
      where: { orgId },
    });
  }

  async countItems(requestId: string): Promise<number> {
    return db.materialRequestItem.count({
      where: { requestId },
    });
  }
}

export const materialRequestRepository = new MaterialRequestRepository();
