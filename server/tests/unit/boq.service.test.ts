/**
 * Unit tests for BoqService.
 * Mocks BoqItemRepository, EstimateService, and AuditService.
 */

import { describe, it, expect, vi } from "vitest";
import { BoqService } from "../../src/modules/estimating/boq.service.js";
import type { BoqItemRepository } from "../../src/modules/estimating/boq-item.repository.js";
import type { EstimateService } from "../../src/modules/estimating/estimate.service.js";
import type { AuditService } from "../../src/modules/audit/audit.service.js";
import { ValidationError } from "../../src/common/AppError.js";
import { Prisma } from "@prisma/client";
import type { Estimate, BoqItem } from "@prisma/client";

vi.mock("../../src/infrastructure/database/client.js", () => ({
  db: {},
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEstimate(overrides?: Partial<Estimate>): Estimate {
  return {
    id: "est_1",
    orgId: "org_1",
    estimateNumber: "EST-0001",
    name: "Test Estimate",
    description: null,
    status: "DRAFT",
    version: 1,
    clientName: null,
    clientContact: null,
    siteAddress: null,
    siteCity: null,
    siteCountry: null,
    currency: "USD",
    validUntil: null,
    notes: null,
    scope: null,
    subtotal: new Prisma.Decimal(0),
    overhead: new Prisma.Decimal(0),
    contingency: new Prisma.Decimal(0),
    markup: new Prisma.Decimal(0),
    totalCost: new Prisma.Decimal(0),
    sellingPrice: new Prisma.Decimal(0),
    margin: new Prisma.Decimal(0),
    overheadPercent: new Prisma.Decimal(0),
    contingencyPercent: new Prisma.Decimal(0),
    markupPercent: new Prisma.Decimal(0),
    projectId: null,
    createdById: "user_1",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function makeBoqItem(overrides?: Partial<BoqItem>): BoqItem {
  return {
    id: "boq_1",
    estimateId: "est_1",
    orgId: "org_1",
    itemCode: null,
    description: "Concrete",
    category: null,
    unit: "m3",
    quantity: new Prisma.Decimal(10),
    materialRate: new Prisma.Decimal(50),
    laborRate: new Prisma.Decimal(20),
    equipmentRate: new Prisma.Decimal(10),
    subcontractorRate: new Prisma.Decimal(0),
    directCostRate: new Prisma.Decimal(80),
    directCostAmount: new Prisma.Decimal(800),
    markupPercent: new Prisma.Decimal(0.1),
    sellingRate: new Prisma.Decimal(88),
    amount: new Prisma.Decimal(880),
    phaseId: null,
    costCodeId: null,
    notes: null,
    order: 0,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function makeMockBoqRepo(overrides?: Partial<Record<keyof BoqItemRepository, unknown>>): BoqItemRepository {
  return {
    create: vi.fn().mockResolvedValue(makeBoqItem()),
    createMany: vi.fn().mockResolvedValue({}),
    findByEstimate: vi.fn().mockResolvedValue([makeBoqItem()]),
    findById: vi.fn().mockResolvedValue(makeBoqItem()),
    update: vi.fn().mockResolvedValue(makeBoqItem()),
    delete: vi.fn().mockResolvedValue({}),
    deleteByEstimate: vi.fn().mockResolvedValue({}),
    countByEstimate: vi.fn().mockResolvedValue(0),
    reorder: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as BoqItemRepository;
}

function makeMockEstimateService(estimateOverrides?: Partial<Estimate>): EstimateService {
  return {
    getEstimate: vi.fn().mockResolvedValue(makeEstimate(estimateOverrides)),
    recalculateTotals: vi.fn().mockResolvedValue(makeEstimate()),
    createVersion: vi.fn().mockResolvedValue({}),
    updateEstimate: vi.fn().mockResolvedValue(makeEstimate()),
    listEstimates: vi.fn().mockResolvedValue([]),
    transitionStatus: vi.fn().mockResolvedValue(makeEstimate()),
    updatePricingFactors: vi.fn().mockResolvedValue(makeEstimate()),
    getCostBreakdown: vi.fn().mockResolvedValue({}),
    getSummary: vi.fn().mockResolvedValue({}),
    compareVersions: vi.fn().mockResolvedValue({}),
    compareEstimates: vi.fn().mockResolvedValue({}),
    convertToProject: vi.fn().mockResolvedValue({}),
    listVersions: vi.fn().mockResolvedValue([]),
    getVersion: vi.fn().mockResolvedValue({}),
    createEstimate: vi.fn().mockResolvedValue(makeEstimate()),
    computeItemFields: vi.fn().mockReturnValue({}),
  } as unknown as EstimateService;
}

function makeMockAuditService(): AuditService {
  return {
    log: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;
}

// ─── addItem ──────────────────────────────────────────────────────────────────

describe("BoqService.addItem", () => {
  it("throws ValidationError when estimate is APPROVED (not editable)", async () => {
    const estimateService = makeMockEstimateService({ status: "APPROVED" });
    const service = new BoqService(makeMockBoqRepo(), estimateService, makeMockAuditService());

    await expect(
      service.addItem("org_1", "est_1", "user_1", {
        description: "Test",
        unit: "m2",
        quantity: 10,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError for empty unit", async () => {
    const estimateService = makeMockEstimateService({ status: "DRAFT" });
    const service = new BoqService(makeMockBoqRepo(), estimateService, makeMockAuditService());

    await expect(
      service.addItem("org_1", "est_1", "user_1", {
        description: "Test",
        unit: "",
        quantity: 10,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError for quantity ≤ 0", async () => {
    const estimateService = makeMockEstimateService({ status: "DRAFT" });
    const service = new BoqService(makeMockBoqRepo(), estimateService, makeMockAuditService());

    await expect(
      service.addItem("org_1", "est_1", "user_1", {
        description: "Test",
        unit: "m2",
        quantity: 0,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("correctly computes directCostRate as sum of all 4 rates", async () => {
    const estimateService = makeMockEstimateService({ status: "DRAFT" });
    const boqRepo = makeMockBoqRepo();
    const service = new BoqService(boqRepo, estimateService, makeMockAuditService());

    await service.addItem("org_1", "est_1", "user_1", {
      description: "Concrete",
      unit: "m3",
      quantity: 1,
      materialRate: 10,
      laborRate: 20,
      equipmentRate: 5,
      subcontractorRate: 15,
    });

    expect(boqRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ directCostRate: 50 }),
    );
  });

  it("correctly computes directCostAmount = directCostRate × quantity", async () => {
    const estimateService = makeMockEstimateService({ status: "DRAFT" });
    const boqRepo = makeMockBoqRepo();
    const service = new BoqService(boqRepo, estimateService, makeMockAuditService());

    await service.addItem("org_1", "est_1", "user_1", {
      description: "Concrete",
      unit: "m3",
      quantity: 3,
      materialRate: 10,
      laborRate: 20,
      equipmentRate: 5,
      subcontractorRate: 15,
    });

    expect(boqRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ directCostAmount: 150 }), // 50 * 3
    );
  });

  it("correctly computes sellingRate = directCostRate × (1 + markupPercent)", async () => {
    const estimateService = makeMockEstimateService({ status: "DRAFT" });
    const boqRepo = makeMockBoqRepo();
    const service = new BoqService(boqRepo, estimateService, makeMockAuditService());

    await service.addItem("org_1", "est_1", "user_1", {
      description: "Concrete",
      unit: "m3",
      quantity: 1,
      materialRate: 50,
      laborRate: 0,
      equipmentRate: 0,
      subcontractorRate: 0,
      markupPercent: 0.1,
    });

    const callArg = vi.mocked(boqRepo.create).mock.calls[0]?.[0];
    expect(callArg).toBeDefined();
    expect(callArg?.sellingRate).toBeCloseTo(55, 5); // 50 * 1.1
  });

  it("correctly computes amount = sellingRate × quantity", async () => {
    const estimateService = makeMockEstimateService({ status: "DRAFT" });
    const boqRepo = makeMockBoqRepo();
    const service = new BoqService(boqRepo, estimateService, makeMockAuditService());

    await service.addItem("org_1", "est_1", "user_1", {
      description: "Concrete",
      unit: "m3",
      quantity: 3,
      materialRate: 50,
      laborRate: 0,
      equipmentRate: 0,
      subcontractorRate: 0,
      markupPercent: 0.1,
    });

    const callArg = vi.mocked(boqRepo.create).mock.calls[0]?.[0];
    expect(callArg).toBeDefined();
    expect(callArg?.amount).toBeCloseTo(165, 5); // 55 * 3
  });

  it("calls recalculateTotals after creating item", async () => {
    const estimateService = makeMockEstimateService({ status: "DRAFT" });
    const service = new BoqService(makeMockBoqRepo(), estimateService, makeMockAuditService());

    await service.addItem("org_1", "est_1", "user_1", {
      description: "Test",
      unit: "m2",
      quantity: 5,
    });

    expect(estimateService.recalculateTotals).toHaveBeenCalledWith("org_1", "est_1");
  });
});

// ─── deleteItem ───────────────────────────────────────────────────────────────

describe("BoqService.deleteItem", () => {
  it("calls recalculateTotals after deleting item", async () => {
    const estimateService = makeMockEstimateService({ status: "DRAFT" });
    const boqRepo = makeMockBoqRepo({
      findById: vi.fn().mockResolvedValue(makeBoqItem()),
    });
    const service = new BoqService(boqRepo, estimateService, makeMockAuditService());

    await service.deleteItem("org_1", "est_1", "boq_1", "user_1");

    expect(estimateService.recalculateTotals).toHaveBeenCalledWith("org_1", "est_1");
  });
});

// ─── listItems ────────────────────────────────────────────────────────────────

describe("BoqService.listItems", () => {
  it("returns items from repo", async () => {
    const items = [makeBoqItem(), makeBoqItem({ id: "boq_2" })];
    const estimateService = makeMockEstimateService();
    const boqRepo = makeMockBoqRepo({
      findByEstimate: vi.fn().mockResolvedValue(items),
    });
    const service = new BoqService(boqRepo, estimateService, makeMockAuditService());

    const result = await service.listItems("org_1", "est_1");
    expect(result).toEqual(items);
    expect(boqRepo.findByEstimate).toHaveBeenCalledWith("est_1");
  });
});
