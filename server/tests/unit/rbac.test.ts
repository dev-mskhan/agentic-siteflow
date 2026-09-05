/**
 * Unit tests for RBAC hasPermission logic.
 * Pure function tests — no infrastructure required.
 */

import { describe, it, expect } from "vitest";
import { hasPermission, hasProjectPermission } from "../../src/modules/auth/rbac.js";
import { Permissions } from "../../src/modules/auth/permissions.js";

describe("hasPermission — ADMIN role", () => {
  it("has organization:read permission", () => {
    expect(hasPermission("ADMIN", Permissions.ORGANIZATION_READ)).toBe(true);
  });

  it("has organization:update permission", () => {
    expect(hasPermission("ADMIN", Permissions.ORGANIZATION_UPDATE)).toBe(true);
  });

  it("has organization:manage_members permission", () => {
    expect(hasPermission("ADMIN", Permissions.ORGANIZATION_MANAGE_MEMBERS)).toBe(true);
  });

  it("has user:read permission", () => {
    expect(hasPermission("ADMIN", Permissions.USER_READ)).toBe(true);
  });

  it("has user:update permission", () => {
    expect(hasPermission("ADMIN", Permissions.USER_UPDATE)).toBe(true);
  });

  it("has user:update:own permission", () => {
    expect(hasPermission("ADMIN", Permissions.USER_UPDATE_OWN)).toBe(true);
  });
});

describe("hasPermission — MEMBER role", () => {
  it("has organization:read permission", () => {
    expect(hasPermission("MEMBER", Permissions.ORGANIZATION_READ)).toBe(true);
  });

  it("does NOT have organization:update permission", () => {
    expect(hasPermission("MEMBER", Permissions.ORGANIZATION_UPDATE)).toBe(false);
  });

  it("does NOT have organization:manage_members permission", () => {
    expect(hasPermission("MEMBER", Permissions.ORGANIZATION_MANAGE_MEMBERS)).toBe(false);
  });

  it("has user:read permission", () => {
    expect(hasPermission("MEMBER", Permissions.USER_READ)).toBe(true);
  });

  it("does NOT have user:update permission", () => {
    expect(hasPermission("MEMBER", Permissions.USER_UPDATE)).toBe(false);
  });

  it("has user:update:own permission", () => {
    expect(hasPermission("MEMBER", Permissions.USER_UPDATE_OWN)).toBe(true);
  });
});

describe("hasPermission — BILLING role", () => {
  it("has organization:read permission", () => {
    expect(hasPermission("BILLING", Permissions.ORGANIZATION_READ)).toBe(true);
  });

  it("does NOT have organization:update permission", () => {
    expect(hasPermission("BILLING", Permissions.ORGANIZATION_UPDATE)).toBe(false);
  });

  it("does NOT have organization:manage_members permission", () => {
    expect(hasPermission("BILLING", Permissions.ORGANIZATION_MANAGE_MEMBERS)).toBe(false);
  });

  it("has user:read permission", () => {
    expect(hasPermission("BILLING", Permissions.USER_READ)).toBe(true);
  });

  it("does NOT have user:update permission", () => {
    expect(hasPermission("BILLING", Permissions.USER_UPDATE)).toBe(false);
  });

  it("has user:update:own permission", () => {
    expect(hasPermission("BILLING", Permissions.USER_UPDATE_OWN)).toBe(true);
  });
});

describe("hasPermission — Phase 5 Procurement & Subcontractor Permissions", () => {
  it("ADMIN has full procurement and subcontractor permissions", () => {
    expect(hasPermission("ADMIN", Permissions.SUBCONTRACTOR_CREATE)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.VENDOR_CREATE)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.MATERIAL_CREATE)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.MATERIAL_REQUEST_CREATE)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.MATERIAL_REQUEST_APPROVE)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.PURCHASE_ORDER_CREATE)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.PURCHASE_ORDER_APPROVE)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.DELIVERY_CREATE)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.INVENTORY_TRANSACT)).toBe(true);
  });

  it("MEMBER has read permissions but cannot mutate", () => {
    expect(hasPermission("MEMBER", Permissions.SUBCONTRACTOR_READ)).toBe(true);
    expect(hasPermission("MEMBER", Permissions.VENDOR_READ)).toBe(true);
    expect(hasPermission("MEMBER", Permissions.MATERIAL_READ)).toBe(true);
    expect(hasPermission("MEMBER", Permissions.PURCHASE_ORDER_READ)).toBe(true);
    expect(hasPermission("MEMBER", Permissions.DELIVERY_READ)).toBe(true);
    expect(hasPermission("MEMBER", Permissions.INVENTORY_READ)).toBe(true);

    expect(hasPermission("MEMBER", Permissions.SUBCONTRACTOR_CREATE)).toBe(false);
    expect(hasPermission("MEMBER", Permissions.VENDOR_CREATE)).toBe(false);
    expect(hasPermission("MEMBER", Permissions.PURCHASE_ORDER_CREATE)).toBe(false);
    expect(hasPermission("MEMBER", Permissions.INVENTORY_TRANSACT)).toBe(false);
  });
});

describe("hasProjectPermission — Phase 5 Project Roles", () => {
  it("PROJECT_MANAGER has procurement, subcontractor, and inventory permissions", () => {
    expect(hasProjectPermission("PROJECT_MANAGER", Permissions.SUBCONTRACTOR_CREATE)).toBe(true);
    expect(hasProjectPermission("PROJECT_MANAGER", Permissions.PURCHASE_ORDER_CREATE)).toBe(true);
    expect(hasProjectPermission("PROJECT_MANAGER", Permissions.PURCHASE_ORDER_APPROVE)).toBe(true);
    expect(hasProjectPermission("PROJECT_MANAGER", Permissions.DELIVERY_UPDATE)).toBe(true);
    expect(hasProjectPermission("PROJECT_MANAGER", Permissions.INVENTORY_TRANSACT)).toBe(true);
  });

  it("PROCUREMENT has PO and vendor mutation permissions but not change order approve", () => {
    expect(hasProjectPermission("PROCUREMENT", Permissions.PURCHASE_ORDER_CREATE)).toBe(true);
    expect(hasProjectPermission("PROCUREMENT", Permissions.VENDOR_CREATE)).toBe(true);
    expect(hasProjectPermission("PROCUREMENT", Permissions.DELIVERY_CREATE)).toBe(true);
    expect(hasProjectPermission("PROCUREMENT", Permissions.INVENTORY_TRANSACT)).toBe(true);
    expect(hasProjectPermission("PROCUREMENT", Permissions.CHANGE_ORDER_APPROVE)).toBe(false);
  });

  it("SITE_SUPERVISOR has delivery and inventory transact but cannot create POs", () => {
    expect(hasProjectPermission("SITE_SUPERVISOR", Permissions.DELIVERY_UPDATE)).toBe(true);
    expect(hasProjectPermission("SITE_SUPERVISOR", Permissions.INVENTORY_TRANSACT)).toBe(true);
    expect(hasProjectPermission("SITE_SUPERVISOR", Permissions.PURCHASE_ORDER_CREATE)).toBe(false);
  });

  it("SUBCONTRACTOR has read permissions for subcontractor, materials, and deliveries", () => {
    expect(hasProjectPermission("SUBCONTRACTOR", Permissions.SUBCONTRACTOR_READ)).toBe(true);
    expect(hasProjectPermission("SUBCONTRACTOR", Permissions.MATERIAL_READ)).toBe(true);
    expect(hasProjectPermission("SUBCONTRACTOR", Permissions.DELIVERY_READ)).toBe(true);
    expect(hasProjectPermission("SUBCONTRACTOR", Permissions.PURCHASE_ORDER_CREATE)).toBe(false);
  });
});

describe("hasPermission — Phase 6 Org Roles", () => {
  it("ADMIN has all Phase 6 permissions", () => {
    expect(hasPermission("ADMIN", Permissions.DOCUMENT_CREATE)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.DOCUMENT_READ)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.DOCUMENT_UPDATE)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.DOCUMENT_DELETE)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.DOCUMENT_LINK)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.RFI_CREATE)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.RFI_READ)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.RFI_UPDATE)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.RFI_ANSWER)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.RFI_CLOSE)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.SUBMITTAL_CREATE)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.SUBMITTAL_READ)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.SUBMITTAL_REVIEW)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.SUBMITTAL_APPROVE)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.INSPECTION_SCHEDULE)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.INSPECTION_READ)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.INSPECTION_RECORD)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.DEFICIENCY_RESOLVE)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.SAFETY_REPORT)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.SAFETY_READ)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.SAFETY_INVESTIGATE)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.COMPLIANCE_CREATE)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.COMPLIANCE_READ)).toBe(true);
    expect(hasPermission("ADMIN", Permissions.COMPLIANCE_UPDATE)).toBe(true);
  });

  it("MEMBER has read-only permissions for Phase 6 modules", () => {
    expect(hasPermission("MEMBER", Permissions.DOCUMENT_READ)).toBe(true);
    expect(hasPermission("MEMBER", Permissions.RFI_READ)).toBe(true);
    expect(hasPermission("MEMBER", Permissions.SUBMITTAL_READ)).toBe(true);
    expect(hasPermission("MEMBER", Permissions.INSPECTION_READ)).toBe(true);
    expect(hasPermission("MEMBER", Permissions.SAFETY_READ)).toBe(true);
    expect(hasPermission("MEMBER", Permissions.COMPLIANCE_READ)).toBe(true);

    expect(hasPermission("MEMBER", Permissions.DOCUMENT_CREATE)).toBe(false);
    expect(hasPermission("MEMBER", Permissions.RFI_CREATE)).toBe(false);
    expect(hasPermission("MEMBER", Permissions.SUBMITTAL_CREATE)).toBe(false);
    expect(hasPermission("MEMBER", Permissions.INSPECTION_RECORD)).toBe(false);
    expect(hasPermission("MEMBER", Permissions.SAFETY_REPORT)).toBe(false);
    expect(hasPermission("MEMBER", Permissions.COMPLIANCE_CREATE)).toBe(false);
  });
});

describe("hasProjectPermission — Phase 6 Project Roles", () => {
  it("PROJECT_MANAGER has full Phase 6 project permissions", () => {
    expect(hasProjectPermission("PROJECT_MANAGER", Permissions.DOCUMENT_CREATE)).toBe(true);
    expect(hasProjectPermission("PROJECT_MANAGER", Permissions.RFI_ANSWER)).toBe(true);
    expect(hasProjectPermission("PROJECT_MANAGER", Permissions.RFI_CLOSE)).toBe(true);
    expect(hasProjectPermission("PROJECT_MANAGER", Permissions.SUBMITTAL_APPROVE)).toBe(true);
    expect(hasProjectPermission("PROJECT_MANAGER", Permissions.INSPECTION_RECORD)).toBe(true);
    expect(hasProjectPermission("PROJECT_MANAGER", Permissions.DEFICIENCY_RESOLVE)).toBe(true);
    expect(hasProjectPermission("PROJECT_MANAGER", Permissions.SAFETY_INVESTIGATE)).toBe(true);
    expect(hasProjectPermission("PROJECT_MANAGER", Permissions.COMPLIANCE_UPDATE)).toBe(true);
  });

  it("SITE_SUPERVISOR has inspection recording, safety reporting, document upload, and RFI create", () => {
    expect(hasProjectPermission("SITE_SUPERVISOR", Permissions.DOCUMENT_CREATE)).toBe(true);
    expect(hasProjectPermission("SITE_SUPERVISOR", Permissions.DOCUMENT_LINK)).toBe(true);
    expect(hasProjectPermission("SITE_SUPERVISOR", Permissions.RFI_CREATE)).toBe(true);
    expect(hasProjectPermission("SITE_SUPERVISOR", Permissions.RFI_READ)).toBe(true);
    expect(hasProjectPermission("SITE_SUPERVISOR", Permissions.INSPECTION_SCHEDULE)).toBe(true);
    expect(hasProjectPermission("SITE_SUPERVISOR", Permissions.INSPECTION_RECORD)).toBe(true);
    expect(hasProjectPermission("SITE_SUPERVISOR", Permissions.DEFICIENCY_RESOLVE)).toBe(true);
    expect(hasProjectPermission("SITE_SUPERVISOR", Permissions.SAFETY_REPORT)).toBe(true);
    expect(hasProjectPermission("SITE_SUPERVISOR", Permissions.SAFETY_READ)).toBe(true);

    expect(hasProjectPermission("SITE_SUPERVISOR", Permissions.RFI_CLOSE)).toBe(false);
    expect(hasProjectPermission("SITE_SUPERVISOR", Permissions.SUBMITTAL_APPROVE)).toBe(false);
    expect(hasProjectPermission("SITE_SUPERVISOR", Permissions.SAFETY_INVESTIGATE)).toBe(false);
  });

  it("SUBCONTRACTOR has submittal submission, RFI read, and deficiency resolve", () => {
    expect(hasProjectPermission("SUBCONTRACTOR", Permissions.SUBMITTAL_CREATE)).toBe(true);
    expect(hasProjectPermission("SUBCONTRACTOR", Permissions.SUBMITTAL_READ)).toBe(true);
    expect(hasProjectPermission("SUBCONTRACTOR", Permissions.RFI_READ)).toBe(true);
    expect(hasProjectPermission("SUBCONTRACTOR", Permissions.DEFICIENCY_RESOLVE)).toBe(true);

    expect(hasProjectPermission("SUBCONTRACTOR", Permissions.RFI_CREATE)).toBe(false);
    expect(hasProjectPermission("SUBCONTRACTOR", Permissions.SUBMITTAL_APPROVE)).toBe(false);
    expect(hasProjectPermission("SUBCONTRACTOR", Permissions.SAFETY_INVESTIGATE)).toBe(false);
  });

  it("CLIENT has read-only access to documents, inspections, and RFIs", () => {
    expect(hasProjectPermission("CLIENT", Permissions.DOCUMENT_READ)).toBe(true);
    expect(hasProjectPermission("CLIENT", Permissions.INSPECTION_READ)).toBe(true);
    expect(hasProjectPermission("CLIENT", Permissions.RFI_READ)).toBe(true);

    expect(hasProjectPermission("CLIENT", Permissions.DOCUMENT_CREATE)).toBe(false);
    expect(hasProjectPermission("CLIENT", Permissions.RFI_CREATE)).toBe(false);
    expect(hasProjectPermission("CLIENT", Permissions.SUBMITTAL_CREATE)).toBe(false);
  });
});


