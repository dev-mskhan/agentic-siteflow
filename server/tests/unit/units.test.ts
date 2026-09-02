/**
 * Unit tests for measurement units helpers.
 */

import { describe, it, expect } from "vitest";
import {
  validateQuantity,
  getUnitsForSystem,
  getAllUnits,
  STANDARD_UNITS,
} from "../../src/modules/estimating/units.js";

// ─── validateQuantity ─────────────────────────────────────────────────────────

describe("validateQuantity", () => {
  it("returns false for 0", () => {
    expect(validateQuantity(0)).toBe(false);
  });

  it("returns false for negative numbers", () => {
    expect(validateQuantity(-1)).toBe(false);
  });

  it("returns true for 6 decimal places", () => {
    expect(validateQuantity(1.123456)).toBe(true);
  });

  it("returns false for 7 decimal places", () => {
    expect(validateQuantity(1.1234567)).toBe(false);
  });

  it("returns true for whole numbers", () => {
    expect(validateQuantity(100)).toBe(true);
  });

  it("returns true for 1", () => {
    expect(validateQuantity(1)).toBe(true);
  });
});

// ─── getUnitsForSystem ────────────────────────────────────────────────────────

describe("getUnitsForSystem", () => {
  it("returns only metric and both units for 'metric'", () => {
    const units = getUnitsForSystem("metric");
    for (const unit of units) {
      expect(["metric", "both"]).toContain(unit.system);
    }
    // Should include m2
    expect(units.map((u) => u.code)).toContain("m2");
    // Should NOT include sqft (imperial only)
    expect(units.map((u) => u.code)).not.toContain("sqft");
  });

  it("returns only imperial and both units for 'imperial'", () => {
    const units = getUnitsForSystem("imperial");
    for (const unit of units) {
      expect(["imperial", "both"]).toContain(unit.system);
    }
    // Should include sqft
    expect(units.map((u) => u.code)).toContain("sqft");
    // Should NOT include m2 (metric only)
    expect(units.map((u) => u.code)).not.toContain("m2");
  });

  it("returns all units for 'both' system filter", () => {
    const bothOnly = getUnitsForSystem("both");
    // Should include hr, nr etc. but not metric/imperial-only ones
    for (const unit of bothOnly) {
      expect(unit.system).toBe("both");
    }
  });

  it("metric result includes 'both' system units like hr", () => {
    const units = getUnitsForSystem("metric");
    expect(units.map((u) => u.code)).toContain("hr");
  });

  it("imperial result includes 'both' system units like hr", () => {
    const units = getUnitsForSystem("imperial");
    expect(units.map((u) => u.code)).toContain("hr");
  });
});

// ─── getAllUnits ──────────────────────────────────────────────────────────────

describe("getAllUnits", () => {
  it("returns all standard units", () => {
    const all = getAllUnits();
    const allKeys = Object.keys(STANDARD_UNITS);
    expect(all.length).toBe(allKeys.length);
  });

  it("includes both metric and imperial units", () => {
    const all = getAllUnits();
    const codes = all.map((u) => u.code);
    expect(codes).toContain("m2");
    expect(codes).toContain("sqft");
    expect(codes).toContain("hr");
    expect(codes).toContain("ls");
  });
});
