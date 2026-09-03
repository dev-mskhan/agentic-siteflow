import { describe, expect, it } from "vitest";
import {
  calcEarliestStart,
  calcVarianceDays,
  findOverrunTasks,
  type TaskNode,
} from "../../src/modules/scheduling/schedule-calc.js";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("schedule calculations", () => {
  it("returns null when a predecessor has no end date", () => {
    const task: TaskNode = {
      id: "B",
      plannedStartDate: null,
      plannedEndDate: null,
      durationDays: 2,
      predecessors: [{ id: "A", type: "FS", lagDays: 0 }],
    };
    expect(calcEarliestStart(task, [{ id: "A", endDate: null }])).toBeNull();
  });

  it("calculates the latest predecessor completion plus lag", () => {
    const task: TaskNode = {
      id: "C",
      plannedStartDate: day("2026-01-01"),
      plannedEndDate: null,
      durationDays: 2,
      predecessors: [
        { id: "A", type: "FS", lagDays: 1 },
        { id: "B", type: "FS", lagDays: 3 },
      ],
    };
    expect(calcEarliestStart(task, [
      { id: "A", endDate: day("2026-01-05") },
      { id: "B", endDate: day("2026-01-06") },
    ])).toEqual(day("2026-01-09"));
  });

  it("returns positive variance for a delayed task", () => {
    expect(calcVarianceDays(10, 13)).toBe(3);
    expect(calcVarianceDays(10, 8)).toBe(-2);
    expect(calcVarianceDays(null, 8)).toBeNull();
  });

  it("finds tasks ending after the project end date", () => {
    const tasks: TaskNode[] = [
      { id: "A", plannedStartDate: null, plannedEndDate: day("2026-01-10"), durationDays: 1, predecessors: [] },
      { id: "B", plannedStartDate: null, plannedEndDate: day("2026-01-12"), durationDays: 1, predecessors: [] },
      { id: "C", plannedStartDate: null, plannedEndDate: null, durationDays: null, predecessors: [] },
    ];
    expect(findOverrunTasks(tasks, day("2026-01-10"))).toEqual(["B"]);
  });
});
