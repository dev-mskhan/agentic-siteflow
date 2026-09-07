import { describe, it, expect } from "vitest";
import { assertNotSelfApprover } from "../../src/modules/commercial/segregation.guard.js";
import { ForbiddenError } from "../../src/common/AppError.js";
import { hasPermission, hasProjectPermission } from "../../src/modules/auth/rbac.js";
import { Permissions } from "../../src/modules/auth/permissions.js";

describe("Segregation of Duties & Commercial RBAC", () => {
  describe("assertNotSelfApprover", () => {
    it("should allow approval when creator and approver are different users", () => {
      expect(() =>
        assertNotSelfApprover("user-creator-1", "user-approver-2", "change order"),
      ).not.toThrow();
    });

    it("should throw ForbiddenError when creator and approver are the exact same user", () => {
      expect(() =>
        assertNotSelfApprover("user-creator-1", "user-creator-1", "change order"),
      ).toThrow(ForbiddenError);
    });

    it("should include item type in the error message", () => {
      expect(() =>
        assertNotSelfApprover("user-creator-1", "user-creator-1", "payment application"),
      ).toThrow(/payment application/);
    });
  });

  describe("Commercial RBAC Permissions", () => {
    it("ADMIN should have all commercial permissions", () => {
      expect(hasPermission("ADMIN", Permissions.BUDGET_MANAGE)).toBe(true);
      expect(hasPermission("ADMIN", Permissions.COST_TRANSACTION_CREATE)).toBe(true);
      expect(hasPermission("ADMIN", Permissions.CHANGE_ORDER_APPROVE)).toBe(true);
      expect(hasPermission("ADMIN", Permissions.SOV_MANAGE)).toBe(true);
      expect(hasPermission("ADMIN", Permissions.PAYMENT_APPLICATION_APPROVE)).toBe(true);
      expect(hasPermission("ADMIN", Permissions.INVOICE_APPROVE)).toBe(true);
      expect(hasPermission("ADMIN", Permissions.PAYMENT_RECORD)).toBe(true);
      expect(hasPermission("ADMIN", Permissions.RETAINAGE_RELEASE)).toBe(true);
    });

    it("FINANCE project role should have approval and recording permissions", () => {
      expect(hasProjectPermission("FINANCE", Permissions.CHANGE_ORDER_APPROVE)).toBe(true);
      expect(hasProjectPermission("FINANCE", Permissions.PAYMENT_APPLICATION_APPROVE)).toBe(true);
      expect(hasProjectPermission("FINANCE", Permissions.INVOICE_APPROVE)).toBe(true);
      expect(hasProjectPermission("FINANCE", Permissions.PAYMENT_RECORD)).toBe(true);
      expect(hasProjectPermission("FINANCE", Permissions.RETAINAGE_RELEASE)).toBe(true);
      expect(hasProjectPermission("FINANCE", Permissions.BUDGET_MANAGE)).toBe(true);
    });

    it("PROJECT_MANAGER should have create and manage permissions but not retainage release", () => {
      expect(hasProjectPermission("PROJECT_MANAGER", Permissions.BUDGET_MANAGE)).toBe(true);
      expect(hasProjectPermission("PROJECT_MANAGER", Permissions.CHANGE_ORDER_CREATE)).toBe(true);
      expect(hasProjectPermission("PROJECT_MANAGER", Permissions.SOV_MANAGE)).toBe(true);
      expect(hasProjectPermission("PROJECT_MANAGER", Permissions.PAYMENT_APPLICATION_CREATE)).toBe(true);
      expect(hasProjectPermission("PROJECT_MANAGER", Permissions.RETAINAGE_RELEASE)).toBe(false);
    });

    it("SUBCONTRACTOR should only have scoped creation/read permissions", () => {
      expect(hasProjectPermission("SUBCONTRACTOR", Permissions.PAYMENT_APPLICATION_CREATE)).toBe(true);
      expect(hasProjectPermission("SUBCONTRACTOR", Permissions.PAYMENT_APPLICATION_READ)).toBe(true);
      expect(hasProjectPermission("SUBCONTRACTOR", Permissions.INVOICE_CREATE)).toBe(true);
      expect(hasProjectPermission("SUBCONTRACTOR", Permissions.BUDGET_MANAGE)).toBe(false);
      expect(hasProjectPermission("SUBCONTRACTOR", Permissions.CHANGE_ORDER_APPROVE)).toBe(false);
    });

    it("CLIENT should have client approval and read permissions", () => {
      expect(hasProjectPermission("CLIENT", Permissions.CHANGE_ORDER_APPROVE)).toBe(true);
      expect(hasProjectPermission("CLIENT", Permissions.PAYMENT_APPLICATION_APPROVE)).toBe(true);
      expect(hasProjectPermission("CLIENT", Permissions.SOV_READ)).toBe(true);
      expect(hasProjectPermission("CLIENT", Permissions.PAYMENT_APPLICATION_CREATE)).toBe(false);
      expect(hasProjectPermission("CLIENT", Permissions.BUDGET_MANAGE)).toBe(false);
    });
  });
});
