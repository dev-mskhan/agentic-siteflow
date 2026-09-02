/**
 * Unit tests for CostCodeService.
 */

import { describe, it, expect, vi } from "vitest";
import { CostCodeService } from "../../src/modules/projects/cost-code.service.js";
import type { CostCodeRepository } from "../../src/modules/projects/cost-code.repository.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";
import { ConflictError, NotFoundError } from "../../src/common/AppError.js";
import type { CostCode } from "@prisma/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCostCode(overrides?: Partial<CostCode>): CostCode {
  return {
    id: "cc_1",
    orgId: "org_1",
    code: "01-LABOR",
    name: "Labor",
    description: null,
    category: null,
    parentId: null,
    isActive: true,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function makeMockRepo(overrides?: Partial<Record<keyof CostCodeRepository, unknown>>): CostCodeRepository {
  return {
    create: vi.fn().mockResolvedValue(makeCostCode()),
    findByOrg: vi.fn().mockResolvedValue([makeCostCode()]),
    findById: vi.fn().mockResolvedValue(makeCostCode()),
    findByOrgAndCode: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(makeCostCode()),
    deactivate: vi.fn().mockResolvedValue(makeCostCode({ isActive: false })),
    ...overrides,
  } as unknown as CostCodeRepository;
}

function makeMockAudit(): AuditService {
  return { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
}

vi.mock("../../src/infrastructure/database/client.js", () => ({
  db: {},
}));

// ─── createCostCode ───────────────────────────────────────────────────────────

describe("CostCodeService.createCostCode", () => {
  it("throws ConflictError for duplicate code in same org", async () => {
    const repo = makeMockRepo({
      findByOrgAndCode: vi.fn().mockResolvedValue(makeCostCode()),
    });
    const service = new CostCodeService(repo, makeMockAudit());

    await expect(
      service.createCostCode("org_1", "user_1", { code: "01-LABOR", name: "Labor" }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(repo.create).not.toHaveBeenCalled();
  });

  it("succeeds with unique code", async () => {
    const repo = makeMockRepo({ findByOrgAndCode: vi.fn().mockResolvedValue(null) });
    const audit = makeMockAudit();
    const service = new CostCodeService(repo, audit);

    const result = await service.createCostCode("org_1", "user_1", {
      code: "02-MATERIALS",
      name: "Materials",
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: "02-MATERIALS", orgId: "org_1" }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "COST_CODE_CREATED" }),
    );
    expect(result).toBeDefined();
  });
});

// ─── listCostCodes ────────────────────────────────────────────────────────────

describe("CostCodeService.listCostCodes", () => {
  it("only returns codes for the requesting org", async () => {
    const org1Codes = [makeCostCode({ orgId: "org_1" })];
    const repo = makeMockRepo({
      findByOrg: vi.fn().mockImplementation((orgId) => {
        if (orgId === "org_1") return Promise.resolve(org1Codes);
        return Promise.resolve([]);
      }),
    });
    const service = new CostCodeService(repo, makeMockAudit());

    const result = await service.listCostCodes("org_1");
    expect(result).toEqual(org1Codes);

    const other = await service.listCostCodes("org_2");
    expect(other).toEqual([]);
  });
});

// ─── deactivateCostCode ───────────────────────────────────────────────────────

describe("CostCodeService.deactivateCostCode", () => {
  it("sets isActive to false", async () => {
    const repo = makeMockRepo({
      findById: vi.fn().mockResolvedValue(makeCostCode({ orgId: "org_1" })),
      deactivate: vi.fn().mockResolvedValue(makeCostCode({ isActive: false })),
    });
    const audit = makeMockAudit();
    const service = new CostCodeService(repo, audit);

    const result = await service.deactivateCostCode("org_1", "user_1", "cc_1");
    expect(result.isActive).toBe(false);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "COST_CODE_DEACTIVATED" }),
    );
  });

  it("throws NotFoundError when cost code not found", async () => {
    const repo = makeMockRepo({
      findById: vi.fn().mockResolvedValue(null),
    });
    const service = new CostCodeService(repo, makeMockAudit());

    await expect(
      service.deactivateCostCode("org_1", "user_1", "nonexistent"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError when code belongs to a different org", async () => {
    const repo = makeMockRepo({
      findById: vi.fn().mockResolvedValue(makeCostCode({ orgId: "org_other" })),
    });
    const service = new CostCodeService(repo, makeMockAudit());

    await expect(
      service.deactivateCostCode("org_1", "user_1", "cc_1"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
