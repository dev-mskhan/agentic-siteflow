import type { InventoryTransaction, InventoryTransactionType } from "@prisma/client";

export type InventoryTransactionRecord = InventoryTransaction;

export interface RecordInventoryTransactionInput {
  materialId: string;
  type: InventoryTransactionType;
  quantity: number;
  unit?: string;
  unitCost?: number;
  referenceType?: string;
  referenceId?: string;
  costCodeId?: string;
  notes?: string;
}

export interface InventoryFilters {
  materialId?: string;
  type?: InventoryTransactionType;
  referenceType?: string;
  limit?: number;
  offset?: number;
}

export interface MaterialStockSummary {
  materialId: string;
  itemCode: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  minStockLevel: number | null;
  isBelowMinimum: boolean;
}

export const INVENTORY_AUDIT_ACTIONS = {
  INVENTORY_TRANSACTED: "INVENTORY_TRANSACTED",
} as const;
