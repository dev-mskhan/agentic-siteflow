/**
 * Unit tests for pure calculation functions.
 * No database required — these are pure functions.
 */

import { describe, it, expect } from "vitest";
import {
  calcDirectCostRate,
  calcDirectCostAmount,
  calcSellingRate,
  calcItemAmount,
  calcSubtotal,
  calcOverhead,
  calcContingency,
  calcTotalCost,
  calcMarkupAmount,
  calcSellingPrice,
  calcMargin,
  calcMaterialSubtotal,
  calcLaborSubtotal,
  calcEquipmentSubtotal,
  calcSubcontractorSubtotal,
} from "../../src/modules/estimating/calculation.js";

// ─── Item-level calculations ──────────────────────────────────────────────────

describe("calcDirectCostRate", () => {
  it("sums all four rates correctly", () => {
    expect(calcDirectCostRate(10, 20, 5, 15)).toBe(50);
  });

  it("handles all-zero inputs", () => {
    expect(calcDirectCostRate(0, 0, 0, 0)).toBe(0);
  });
});

describe("calcDirectCostAmount", () => {
  it("multiplies rate by quantity", () => {
    expect(calcDirectCostAmount(50, 3)).toBe(150);
  });

  it("handles zero quantity", () => {
    expect(calcDirectCostAmount(50, 0)).toBe(0);
  });
});

describe("calcSellingRate", () => {
  it("applies markup correctly: rate × (1 + markup)", () => {
    expect(calcSellingRate(50, 0.1)).toBeCloseTo(55);
  });

  it("returns same rate when markup is 0", () => {
    expect(calcSellingRate(50, 0)).toBe(50);
  });
});

describe("calcItemAmount", () => {
  it("multiplies selling rate by quantity", () => {
    expect(calcItemAmount(55, 3)).toBe(165);
  });

  it("handles all-zero inputs", () => {
    expect(calcItemAmount(0, 0)).toBe(0);
  });
});

// ─── Estimate-level aggregation ───────────────────────────────────────────────

describe("calcSubtotal", () => {
  it("sums directCostAmount across items", () => {
    const items = [
      { materialRate: 10, laborRate: 0, equipmentRate: 0, subcontractorRate: 0, quantity: 2, directCostAmount: 100 },
      { materialRate: 0, laborRate: 20, equipmentRate: 0, subcontractorRate: 0, quantity: 5, directCostAmount: 200 },
    ];
    expect(calcSubtotal(items)).toBe(300);
  });

  it("returns 0 for empty item list", () => {
    expect(calcSubtotal([])).toBe(0);
  });
});

describe("calcOverhead", () => {
  it("multiplies subtotal by overhead percent", () => {
    expect(calcOverhead(1000, 0.1)).toBe(100);
  });

  it("handles zero percent", () => {
    expect(calcOverhead(1000, 0)).toBe(0);
  });
});

describe("calcContingency", () => {
  it("multiplies subtotal by contingency percent", () => {
    expect(calcContingency(1000, 0.05)).toBe(50);
  });
});

describe("calcTotalCost", () => {
  it("sums subtotal + overhead + contingency", () => {
    expect(calcTotalCost(1000, 100, 50)).toBe(1150);
  });

  it("handles all-zero inputs", () => {
    expect(calcTotalCost(0, 0, 0)).toBe(0);
  });
});

describe("calcMarkupAmount", () => {
  it("multiplies total cost by markup percent", () => {
    expect(calcMarkupAmount(1000, 0.15)).toBe(150);
  });
});

describe("calcSellingPrice", () => {
  it("adds markup amount to total cost", () => {
    expect(calcSellingPrice(1000, 150)).toBe(1150);
  });
});

describe("calcMargin", () => {
  it("returns 0 when selling price is 0 (no divide-by-zero)", () => {
    expect(calcMargin(0, 0)).toBe(0);
  });

  it("calculates correctly: (120 - 100) / 120 ≈ 0.1667", () => {
    expect(calcMargin(120, 100)).toBeCloseTo(0.1667, 4);
  });

  it("returns 0 margin when selling price equals total cost", () => {
    expect(calcMargin(100, 100)).toBe(0);
  });
});

// ─── Breakdown by cost type ───────────────────────────────────────────────────

const sampleItems = [
  {
    materialRate: 10,
    laborRate: 20,
    equipmentRate: 5,
    subcontractorRate: 15,
    quantity: 2,
    directCostAmount: 100,
  },
  {
    materialRate: 30,
    laborRate: 10,
    equipmentRate: 0,
    subcontractorRate: 5,
    quantity: 3,
    directCostAmount: 135,
  },
];

describe("calcMaterialSubtotal", () => {
  it("sums materialRate × quantity across items", () => {
    // 10*2 + 30*3 = 20 + 90 = 110
    expect(calcMaterialSubtotal(sampleItems)).toBe(110);
  });

  it("returns 0 for empty items", () => {
    expect(calcMaterialSubtotal([])).toBe(0);
  });
});

describe("calcLaborSubtotal", () => {
  it("sums laborRate × quantity across items", () => {
    // 20*2 + 10*3 = 40 + 30 = 70
    expect(calcLaborSubtotal(sampleItems)).toBe(70);
  });
});

describe("calcEquipmentSubtotal", () => {
  it("sums equipmentRate × quantity across items", () => {
    // 5*2 + 0*3 = 10
    expect(calcEquipmentSubtotal(sampleItems)).toBe(10);
  });
});

describe("calcSubcontractorSubtotal", () => {
  it("sums subcontractorRate × quantity across items", () => {
    // 15*2 + 5*3 = 30 + 15 = 45
    expect(calcSubcontractorSubtotal(sampleItems)).toBe(45);
  });
});
