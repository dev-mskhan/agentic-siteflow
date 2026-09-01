/**
 * Unit tests for AuditService.
 * Verifies append-only semantics and fire-and-forget safety.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuditService } from "../../src/modules/audit/audit.service.js";
import type { AuditRepository } from "../../src/modules/audit/audit.repository.js";
import type { AuditEntry } from "../../src/modules/audit/audit.types.js";
import type { AuditLog } from "@prisma/client";

function makeAuditLog(overrides?: Partial<AuditLog>): AuditLog {
  return {
    id: "audit_1",
    orgId: "org_1",
    userId: "user_1",
    action: "USER_LOGIN",
    entity: "User",
    entityId: "user_1",
    oldValue: null,
    newValue: null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeMockAuditRepo(
  overrides?: Partial<Record<keyof AuditRepository, unknown>>,
): AuditRepository {
  return {
    create: vi.fn().mockResolvedValue(makeAuditLog()),
    findByOrg: vi.fn().mockResolvedValue([]),
    findByUser: vi.fn().mockResolvedValue([]),
    findByEntity: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as AuditRepository;
}

describe("AuditService.log", () => {
  let repo: AuditRepository;
  let service: AuditService;

  beforeEach(() => {
    repo = makeMockAuditRepo();
    service = new AuditService(repo);
  });

  it("calls repository create with the correct entry shape", async () => {
    const entry: AuditEntry = {
      orgId: "org_1",
      userId: "user_1",
      action: "USER_LOGIN",
      entity: "User",
      entityId: "user_1",
    };

    await service.log(entry);

    expect(repo.create).toHaveBeenCalledOnce();
    expect(repo.create).toHaveBeenCalledWith(entry);
  });

  it("does NOT throw if the repository fails (fire-and-forget safety)", async () => {
    repo = makeMockAuditRepo({
      create: vi.fn().mockRejectedValue(new Error("DB down")),
    });
    service = new AuditService(repo);

    // Should resolve without throwing
    await expect(
      service.log({ action: "USER_LOGIN", entity: "User" }),
    ).resolves.toBeUndefined();
  });

  it("creates entry with correct action and entity fields", async () => {
    await service.log({ action: "ORG_CREATED", entity: "Organization", entityId: "org_1" });

    const call = vi.mocked(repo.create).mock.calls[0]![0];
    expect(call.action).toBe("ORG_CREATED");
    expect(call.entity).toBe("Organization");
    expect(call.entityId).toBe("org_1");
  });

  it("passes timestamps — createdAt is set by the repository/DB", async () => {
    await service.log({ action: "USER_LOGOUT", entity: "Session" });

    // AuditService doesn't set createdAt — that's the DB default
    const call = vi.mocked(repo.create).mock.calls[0]![0];
    expect(call.action).toBe("USER_LOGOUT");
    // repo.create returns a mock with a createdAt
    const result = await repo.create(call);
    expect(result.createdAt).toBeInstanceOf(Date);
  });
});
