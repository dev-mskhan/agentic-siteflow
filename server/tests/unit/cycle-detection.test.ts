import { describe, expect, it } from "vitest";
import { wouldCreateCycle } from "../../src/modules/scheduling/cycle-detection.js";

describe("wouldCreateCycle", () => {
  it("allows an edge that does not close a path", () => {
    expect(
      wouldCreateCycle(
        [
          { from: "A", to: "B" },
          { from: "B", to: "C" },
        ],
        "A",
        "D",
      ),
    ).toBe(false);
  });

  it("detects a direct cycle", () => {
    expect(wouldCreateCycle([{ from: "A", to: "B" }], "B", "A")).toBe(true);
  });

  it("detects a transitive cycle", () => {
    expect(
      wouldCreateCycle(
        [
          { from: "A", to: "B" },
          { from: "B", to: "C" },
        ],
        "C",
        "A",
      ),
    ).toBe(true);
  });

  it("detects a self-loop", () => {
    expect(wouldCreateCycle([], "A", "A")).toBe(true);
  });

  it("allows an edge in an empty graph", () => {
    expect(wouldCreateCycle([], "A", "B")).toBe(false);
  });

  it("does not confuse disconnected components", () => {
    expect(wouldCreateCycle([{ from: "A", to: "B" }], "C", "D")).toBe(false);
  });
});
