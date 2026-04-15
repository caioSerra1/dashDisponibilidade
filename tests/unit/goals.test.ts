import { describe, it, expect } from "vitest";
import { evaluateGoals, type GoalLike, type GoalMetricsCtx } from "@/lib/goals";

const ctx: GoalMetricsCtx = {
  pontosMes: 30,
  tasksClosedMonth: 12,
  slaMedioMes: 99.5,
  avgResolutionHoursMonth: 18,
  tasksClosedWeek: 4,
};

const base = {
  active: true,
  renewable: true,
  endedAt: null,
} as const;

describe("evaluateGoals", () => {
  it("POINTS bate quando atinge target", () => {
    const goals: GoalLike[] = [
      { ...base, id: "1", kind: "POINTS", period: "MONTH", target: 30, coinsReward: 100 },
      { ...base, id: "2", kind: "POINTS", period: "MONTH", target: 50, coinsReward: 200 },
    ];
    const hit = evaluateGoals(goals, ctx);
    expect(hit.map((g) => g.id)).toEqual(["1"]);
  });

  it("TASKS_CLOSED respeita period MONTH vs WEEK", () => {
    const goals: GoalLike[] = [
      { ...base, id: "m", kind: "TASKS_CLOSED", period: "MONTH", target: 10, coinsReward: 50 },
      { ...base, id: "w", kind: "TASKS_CLOSED", period: "WEEK", target: 5, coinsReward: 30 },
    ];
    const hit = evaluateGoals(goals, ctx);
    expect(hit.map((g) => g.id)).toEqual(["m"]);
  });

  it("SLA bate quando >= target", () => {
    const goals: GoalLike[] = [
      { ...base, id: "s", kind: "SLA", period: "MONTH", target: 99, coinsReward: 80 },
    ];
    expect(evaluateGoals(goals, ctx)).toHaveLength(1);
  });

  it("AVG_RESOLUTION usa <=", () => {
    const goals: GoalLike[] = [
      { ...base, id: "r", kind: "AVG_RESOLUTION", period: "MONTH", target: 24, coinsReward: 60 },
      { ...base, id: "r2", kind: "AVG_RESOLUTION", period: "MONTH", target: 10, coinsReward: 60 },
    ];
    const hit = evaluateGoals(goals, ctx);
    expect(hit.map((g) => g.id)).toEqual(["r"]);
  });

  it("ignora metas inativas", () => {
    const goals: GoalLike[] = [
      { ...base, id: "x", kind: "POINTS", period: "MONTH", target: 1, coinsReward: 50, active: false },
    ];
    expect(evaluateGoals(goals, ctx)).toEqual([]);
  });

  it("ignora metas encerradas (endedAt preenchido)", () => {
    const goals: GoalLike[] = [
      {
        ...base,
        id: "ended",
        kind: "POINTS",
        period: "CONTINUOUS",
        target: 1,
        coinsReward: 50,
        endedAt: new Date("2025-01-01"),
      },
    ];
    expect(evaluateGoals(goals, ctx)).toEqual([]);
  });

  it("meta contínua é avaliada como qualquer outra enquanto endedAt for null", () => {
    const goals: GoalLike[] = [
      {
        ...base,
        id: "cont",
        kind: "POINTS",
        period: "CONTINUOUS",
        target: 20,
        coinsReward: 100,
        renewable: false,
      },
    ];
    expect(evaluateGoals(goals, ctx).map((g) => g.id)).toEqual(["cont"]);
  });

  it("CUSTOM nunca auto-desbloqueia", () => {
    const goals: GoalLike[] = [
      { ...base, id: "c", kind: "CUSTOM", period: "MONTH", target: 1, coinsReward: 50 },
    ];
    expect(evaluateGoals(goals, ctx)).toEqual([]);
  });
});
