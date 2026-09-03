import type { Vendor, VendorStatus } from "@prisma/client";

export type VendorRecord = Vendor;

export interface CreateVendorInput {
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  taxId?: string;
  paymentTerms?: string;
  currency?: string;
  notes?: string;
}

export interface UpdateVendorInput {
  name?: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  taxId?: string | null;
  paymentTerms?: string | null;
  currency?: string;
  status?: VendorStatus;
  notes?: string | null;
}

export interface VendorFilters {
  status?: VendorStatus;
  search?: string;
  city?: string;
  limit?: number;
  offset?: number;
}

export const VENDOR_AUDIT_ACTIONS = {
  VENDOR_CREATED: "VENDOR_CREATED",
  VENDOR_UPDATED: "VENDOR_UPDATED",
  VENDOR_STATUS_CHANGED: "VENDOR_STATUS_CHANGED",
} as const;
