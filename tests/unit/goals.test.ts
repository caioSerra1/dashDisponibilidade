import { describe, it, expect } from "vitest";
import { evaluateGoals, type GoalLike, type GoalMetricsCtx } from "@/lib/goals";

const ctx: GoalMetricsCtx = {
  pontosMes: 30,
  tasksClosedMonth: 12,
  slaMedioMes: 99.5,
  avgResolutionHoursMonth: 18,
  tasksClosedWeek: 4,
};

describe("evaluateGoals", () => {
  it("POINTS bate quando atinge target", () => {
    const goals: GoalLike[] = [
      { id: "1", kind: "POINTS", period: "MONTH", target: 30, coinsReward: 100, active: true },
      { id: "2", kind: "POINTS", period: "MONTH", target: 50, coinsReward: 200, active: true },
    ];
    const hit = evaluateGoals(goals, ctx);
    expect(hit.map((g) => g.id)).toEqual(["1"]);
  });

  it("TASKS_CLOSED respeita period MONTH vs WEEK", () => {
    const goals: GoalLike[] = [
      { id: "m", kind: "TASKS_CLOSED", period: "MONTH", target: 10, coinsReward: 50, active: true },
      { id: "w", kind: "TASKS_CLOSED", period: "WEEK", target: 5, coinsReward: 30, active: true },
    ];
    const hit = evaluateGoals(goals, ctx);
    expect(hit.map((g) => g.id)).toEqual(["m"]);
  });

  it("SLA bate quando >= target", () => {
    const goals: GoalLike[] = [
      { id: "s", kind: "SLA", period: "MONTH", target: 99, coinsReward: 80, active: true },
    ];
    expect(evaluateGoals(goals, ctx)).toHaveLength(1);
  });

  it("AVG_RESOLUTION usa <=", () => {
    const goals: GoalLike[] = [
      { id: "r", kind: "AVG_RESOLUTION", period: "MONTH", target: 24, coinsReward: 60, active: true },
      { id: "r2", kind: "AVG_RESOLUTION", period: "MONTH", target: 10, coinsReward: 60, active: true },
    ];
    const hit = evaluateGoals(goals, ctx);
    expect(hit.map((g) => g.id)).toEqual(["r"]);
  });

  it("ignora metas inativas", () => {
    const goals: GoalLike[] = [
      { id: "x", kind: "POINTS", period: "MONTH", target: 1, coinsReward: 50, active: false },
    ];
    expect(evaluateGoals(goals, ctx)).toEqual([]);
  });

  it("CUSTOM nunca auto-desbloqueia", () => {
    const goals: GoalLike[] = [
      { id: "c", kind: "CUSTOM", period: "MONTH", target: 1, coinsReward: 50, active: true },
    ];
    expect(evaluateGoals(goals, ctx)).toEqual([]);
  });
});
