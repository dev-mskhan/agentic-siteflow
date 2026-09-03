import { Prisma } from "@prisma/client";
import type { InventoryTransaction, InventoryTransactionType } from "@prisma/client";
import { db } from "../../infrastructure/database/client.js";
import type { InventoryFilters, MaterialStockSummary } from "./inventory.types.js";

export interface CreateInventoryTransactionData {
  orgId: string;
  projectId: string;
  materialId: string;
  type: InventoryTransactionType;
  quantity: number | Prisma.Decimal;
  unit: string;
  unitCost?: number | Prisma.Decimal | null;
  totalCost?: number | Prisma.Decimal | null;
  referenceType?: string | null;
  referenceId?: string | null;
  costCodeId?: string | null;
  notes?: string | null;
  performedById: string;
}

export class InventoryRepository {
  async findProject(orgId: string, projectId: string) {
    return db.project.findFirst({
      where: { id: projectId, orgId },
      select: { id: true },
    });
  }

  async findMaterial(orgId: string, materialId: string) {
    return db.material.findFirst({
      where: { id: materialId, orgId },
    });
  }

  async findCostCode(orgId: string, costCodeId: string) {
    return db.costCode.findFirst({
      where: { id: costCodeId, orgId },
      select: { id: true },
    });
  }

  async create(data: CreateInventoryTransactionData): Promise<InventoryTransaction> {
    return db.inventoryTransaction.create({
      data: {
        orgId: data.orgId,
        projectId: data.projectId,
        materialId: data.materialId,
        type: data.type,
        quantity: new Prisma.Decimal(data.quantity.toString()),
        unit: data.unit,
        unitCost: data.unitCost != null ? new Prisma.Decimal(data.unitCost.toString()) : null,
        totalCost: data.totalCost != null ? new Prisma.Decimal(data.totalCost.toString()) : null,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        costCodeId: data.costCodeId,
        notes: data.notes,
        performedById: data.performedById,
      },
    });
  }

  async findByProjectAndMaterial(
    orgId: string,
    projectId: string,
    materialId: string,
  ): Promise<InventoryTransaction[]> {
    return db.inventoryTransaction.findMany({
      where: {
        orgId,
        projectId,
        materialId,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async listByProject(
    orgId: string,
    projectId: string,
    filters?: InventoryFilters,
  ): Promise<{ transactions: InventoryTransaction[]; total: number }> {
    const where: Prisma.InventoryTransactionWhereInput = {
      orgId,
      projectId,
      ...(filters?.materialId ? { materialId: filters.materialId } : {}),
      ...(filters?.type ? { type: filters.type } : {}),
      ...(filters?.referenceType ? { referenceType: filters.referenceType } : {}),
    };

    const [transactions, total] = await Promise.all([
      db.inventoryTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: filters?.limit ?? 50,
        skip: filters?.offset ?? 0,
      }),
      db.inventoryTransaction.count({ where }),
    ]);

    return { transactions, total };
  }

  async calculateStock(orgId: string, projectId: string, materialId: string): Promise<number> {
    const transactions = await db.inventoryTransaction.findMany({
      where: {
        orgId,
        projectId,
        materialId,
      },
      select: {
        type: true,
        quantity: true,
      },
    });

    let stock = new Prisma.Decimal(0);
    for (const tx of transactions) {
      const qty = new Prisma.Decimal(tx.quantity.toString());
      switch (tx.type) {
        case "RECEIPT":
        case "TRANSFER_IN":
          stock = stock.plus(qty);
          break;
        case "CONSUMPTION":
        case "RETURN_TO_VENDOR":
        case "TRANSFER_OUT":
          stock = stock.minus(qty);
          break;
        case "ADJUSTMENT":
          stock = stock.plus(qty);
          break;
      }
    }

    return stock.toNumber();
  }

  async getProjectStock(
    orgId: string,
    projectId: string,
    materialId?: string,
  ): Promise<MaterialStockSummary[]> {
    // Fetch materials
    const materialWhere: Prisma.MaterialWhereInput = {
      orgId,
      ...(materialId ? { id: materialId } : { isActive: true }),
    };

    const materials = await db.material.findMany({
      where: materialWhere,
      select: {
        id: true,
        itemCode: true,
        name: true,
        category: true,
        unit: true,
        minStockLevel: true,
      },
      orderBy: { name: "asc" },
    });

    // Fetch all inventory transactions for this project
    const transactions = await db.inventoryTransaction.findMany({
      where: {
        orgId,
        projectId,
        ...(materialId ? { materialId } : {}),
      },
      select: {
        materialId: true,
        type: true,
        quantity: true,
      },
    });

    // Aggregate stock by materialId
    const stockMap = new Map<string, Prisma.Decimal>();
    for (const tx of transactions) {
      const current = stockMap.get(tx.materialId) ?? new Prisma.Decimal(0);
      const qty = new Prisma.Decimal(tx.quantity.toString());
      let updated: Prisma.Decimal;
      switch (tx.type) {
        case "RECEIPT":
        case "TRANSFER_IN":
          updated = current.plus(qty);
          break;
        case "CONSUMPTION":
        case "RETURN_TO_VENDOR":
        case "TRANSFER_OUT":
          updated = current.minus(qty);
          break;
        case "ADJUSTMENT":
          updated = current.plus(qty);
          break;
        default:
          updated = current;
      }
      stockMap.set(tx.materialId, updated);
    }

    return materials.map((m) => {
      const stockDecimal = stockMap.get(m.id) ?? new Prisma.Decimal(0);
      const currentStock = stockDecimal.toNumber();
      const minStock = m.minStockLevel ? Number(m.minStockLevel) : null;
      const isBelowMinimum = minStock !== null && currentStock < minStock;

      return {
        materialId: m.id,
        itemCode: m.itemCode,
        name: m.name,
        category: m.category,
        unit: m.unit,
        currentStock,
        minStockLevel: minStock,
        isBelowMinimum,
      };
    });
  }
}
