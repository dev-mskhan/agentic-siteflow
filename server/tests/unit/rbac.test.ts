/**
 * Unit tests for RBAC hasPermission logic.
 * Pure function tests — no infrastructure required.
 */

import { describe, it, expect } from "vitest";
import { hasPermission } from "../../src/modules/auth/rbac.js";
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
