import type { Material } from "@prisma/client";

export type MaterialRecord = Material;

export interface CreateMaterialInput {
  name: string;
  itemCode?: string;
  description?: string;
  category: string;
  unit: string;
  standardCost?: number;
  currency?: string;
  preferredVendorId?: string;
  costCodeId?: string;
  minStockLevel?: number;
}

export interface UpdateMaterialInput {
  name?: string;
  description?: string | null;
  category?: string;
  unit?: string;
  standardCost?: number;
  currency?: string;
  preferredVendorId?: string | null;
  costCodeId?: string | null;
  minStockLevel?: number | null;
  isActive?: boolean;
}

export interface MaterialFilters {
  category?: string;
  isActive?: boolean;
  search?: string;
  preferredVendorId?: string;
  limit?: number;
  offset?: number;
}

export const MATERIAL_AUDIT_ACTIONS = {
  MATERIAL_CREATED: "MATERIAL_CREATED",
  MATERIAL_UPDATED: "MATERIAL_UPDATED",
  MATERIAL_ARCHIVED: "MATERIAL_ARCHIVED",
} as const;
