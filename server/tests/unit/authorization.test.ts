/**
 * Unit tests for checkOwnership and checkProjectOwnership authorization helpers.
 * Pure function tests — no infrastructure required.
 */

import { describe, it, expect } from "vitest";
import { checkOwnership, checkProjectOwnership } from "../../src/modules/auth/authorization.js";
import { Permissions } from "../../src/modules/auth/permissions.js";

const USER_ID = "user-123";
const OTHER_USER_ID = "user-456";

// At the org level, TASK_UPDATE and TASK_UPDATE_OWN are project-level permissions only.
// Org-level ADMIN has USER_UPDATE (broad) and USER_UPDATE_OWN (own-scoped).
// MEMBER has USER_UPDATE_OWN but NOT USER_UPDATE — making it the perfect analog at org level
// for the "own-permission only" scenario.
// BILLING has neither USER_UPDATE nor USER_UPDATE_OWN (only USER_UPDATE_OWN) — same as MEMBER.
describe("checkOwnership — org-level roles with USER_UPDATE / USER_UPDATE_OWN", () => {
  // Case 1: ADMIN has USER_UPDATE (broad) — passes regardless of ownership
  it("ADMIN + not owner → true (broad USER_UPDATE permission passes regardless of ownership)", () => {
    const result = checkOwnership(
      USER_ID,
      OTHER_USER_ID, // not the owner
      Permissions.USER_UPDATE,
      Permissions.USER_UPDATE_OWN,
      "ADMIN",
    );
    expect(result).toBe(true);
  });

  // Case 2: MEMBER has USER_UPDATE_OWN but NOT USER_UPDATE — is owner → allow
  it("MEMBER + is owner → true (USER_UPDATE_OWN + ownership)", () => {
    const result = checkOwnership(
      USER_ID,
      USER_ID, // is the owner
      Permissions.USER_UPDATE,
      Permissions.USER_UPDATE_OWN,
      "MEMBER",
    );
    expect(result).toBe(true);
  });

  // Case 3: MEMBER has USER_UPDATE_OWN but NOT USER_UPDATE — not owner → false
  it("MEMBER + not owner → false (USER_UPDATE_OWN but not owner)", () => {
    const result = checkOwnership(
      USER_ID,
      OTHER_USER_ID, // not the owner
      Permissions.USER_UPDATE,
      Permissions.USER_UPDATE_OWN,
      "MEMBER",
    );
    expect(result).toBe(false);
  });

  // Case 4: BILLING has neither USER_UPDATE nor USER_UPDATE_OWN (for this check) → false even if owner
  // Actually BILLING has USER_UPDATE_OWN. Use a permission BILLING doesn't have at all.
  // BILLING does not have USER_UPDATE (broad) nor ORGANIZATION_UPDATE own-scoped variant.
  // For the "no permissions" case, use ORGANIZATION_UPDATE / ORGANIZATION_MANAGE_MEMBERS
  // which BILLING lacks entirely.
  it("BILLING (no relevant permissions) + is owner → false (no matching permissions)", () => {
    const result = checkOwnership(
      USER_ID,
      USER_ID, // is the owner
      Permissions.ORGANIZATION_UPDATE,
      Permissions.ORGANIZATION_MANAGE_MEMBERS,
      "BILLING",
    );
    expect(result).toBe(false);
  });

  // Case 5: ADMIN + is owner → true (broad permission still passes)
  it("ADMIN + is owner → true (broad USER_UPDATE permission still passes)", () => {
    const result = checkOwnership(
      USER_ID,
      USER_ID, // is the owner
      Permissions.USER_UPDATE,
      Permissions.USER_UPDATE_OWN,
      "ADMIN",
    );
    expect(result).toBe(true);
  });

  // Null/undefined resource owner edge cases
  it("null resourceOwnerId + MEMBER → false (cannot match ownership)", () => {
    const result = checkOwnership(
      USER_ID,
      null,
      Permissions.USER_UPDATE,
      Permissions.USER_UPDATE_OWN,
      "MEMBER",
    );
    expect(result).toBe(false);
  });

  it("undefined resourceOwnerId + MEMBER → false (cannot match ownership)", () => {
    const result = checkOwnership(
      USER_ID,
      undefined,
      Permissions.USER_UPDATE,
      Permissions.USER_UPDATE_OWN,
      "MEMBER",
    );
    expect(result).toBe(false);
  });

  // null resourceOwnerId with ADMIN still passes via broad permission
  it("null resourceOwnerId + ADMIN → true (broad permission bypasses ownership check)", () => {
    const result = checkOwnership(
      USER_ID,
      null,
      Permissions.USER_UPDATE,
      Permissions.USER_UPDATE_OWN,
      "ADMIN",
    );
    expect(result).toBe(true);
  });
});

describe("checkProjectOwnership — project-level roles with TASK_UPDATE / TASK_UPDATE_OWN", () => {
  // PROJECT_MANAGER has TASK_UPDATE (broad) — not owner → true
  it("PROJECT_MANAGER + not owner → true (broad TASK_UPDATE permission passes)", () => {
    const result = checkProjectOwnership(
      USER_ID,
      OTHER_USER_ID, // not the owner
      Permissions.TASK_UPDATE,
      Permissions.TASK_UPDATE_OWN,
      "PROJECT_MANAGER",
    );
    expect(result).toBe(true);
  });

  // SUBCONTRACTOR (ProjectRole) has TASK_UPDATE_OWN but NOT TASK_UPDATE — is owner → true
  it("SUBCONTRACTOR project role + is owner → true (TASK_UPDATE_OWN + ownership)", () => {
    const result = checkProjectOwnership(
      USER_ID,
      USER_ID, // is the owner
      Permissions.TASK_UPDATE,
      Permissions.TASK_UPDATE_OWN,
      "SUBCONTRACTOR",
    );
    expect(result).toBe(true);
  });

  // SUBCONTRACTOR + NOT owner → false (has own permission but not owner)
  it("SUBCONTRACTOR project role + not owner → false (TASK_UPDATE_OWN but not owner)", () => {
    const result = checkProjectOwnership(
      USER_ID,
      OTHER_USER_ID, // not the owner
      Permissions.TASK_UPDATE,
      Permissions.TASK_UPDATE_OWN,
      "SUBCONTRACTOR",
    );
    expect(result).toBe(false);
  });

  // PROJECT_MANAGER + is owner → true (broad permission passes)
  it("PROJECT_MANAGER + is owner → true (broad permission still passes)", () => {
    const result = checkProjectOwnership(
      USER_ID,
      USER_ID, // is the owner
      Permissions.TASK_UPDATE,
      Permissions.TASK_UPDATE_OWN,
      "PROJECT_MANAGER",
    );
    expect(result).toBe(true);
  });

  // VIEWER has neither TASK_UPDATE nor TASK_UPDATE_OWN → false even if owner
  it("VIEWER + is owner → false (no task permissions at all)", () => {
    const result = checkProjectOwnership(
      USER_ID,
      USER_ID, // is the owner
      Permissions.TASK_UPDATE,
      Permissions.TASK_UPDATE_OWN,
      "VIEWER",
    );
    expect(result).toBe(false);
  });

  // VIEWER + not owner → false
  it("VIEWER + not owner → false", () => {
    const result = checkProjectOwnership(
      USER_ID,
      OTHER_USER_ID,
      Permissions.TASK_UPDATE,
      Permissions.TASK_UPDATE_OWN,
      "VIEWER",
    );
    expect(result).toBe(false);
  });
});

// These 5 tests satisfy all 5 checkOwnership combinations per the spec,
// tested at the project level where SUBCONTRACTOR = own-only, PROJECT_MANAGER = broad.
describe("checkOwnership — 5 canonical combinations (via checkProjectOwnership)", () => {
  it("Case 1: broad-permission role + not owner → true", () => {
    // PROJECT_MANAGER has TASK_UPDATE (broad); user does NOT own the resource
    expect(
      checkProjectOwnership(USER_ID, OTHER_USER_ID, Permissions.TASK_UPDATE, Permissions.TASK_UPDATE_OWN, "PROJECT_MANAGER"),
    ).toBe(true);
  });

  it("Case 2: own-permission role + is owner → true", () => {
    // SUBCONTRACTOR has TASK_UPDATE_OWN but not TASK_UPDATE; user IS the owner
    expect(
      checkProjectOwnership(USER_ID, USER_ID, Permissions.TASK_UPDATE, Permissions.TASK_UPDATE_OWN, "SUBCONTRACTOR"),
    ).toBe(true);
  });

  it("Case 3: own-permission role + not owner → false", () => {
    // SUBCONTRACTOR has TASK_UPDATE_OWN but not TASK_UPDATE; user is NOT the owner
    expect(
      checkProjectOwnership(USER_ID, OTHER_USER_ID, Permissions.TASK_UPDATE, Permissions.TASK_UPDATE_OWN, "SUBCONTRACTOR"),
    ).toBe(false);
  });

  it("Case 4: no-permission role + is owner → false", () => {
    // VIEWER has neither TASK_UPDATE nor TASK_UPDATE_OWN; user IS the owner
    expect(
      checkProjectOwnership(USER_ID, USER_ID, Permissions.TASK_UPDATE, Permissions.TASK_UPDATE_OWN, "VIEWER"),
    ).toBe(false);
  });

  it("Case 5: broad-permission role + is owner → true", () => {
    // PROJECT_MANAGER has TASK_UPDATE (broad); user IS also the owner
    expect(
      checkProjectOwnership(USER_ID, USER_ID, Permissions.TASK_UPDATE, Permissions.TASK_UPDATE_OWN, "PROJECT_MANAGER"),
    ).toBe(true);
  });
});
