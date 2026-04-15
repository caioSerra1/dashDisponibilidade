import { describe, it, expect } from "vitest";
import {
  evaluateRule,
  evaluateMilestones,
  type MilestoneContext,
  type MilestoneLike,
} from "@/lib/milestones";

const baseCtx: MilestoneContext = {
  slaFinal: 100,
  pontosMes: 50,
  hasClosedBefore: false,
  goalHitsInMonth: 0,
  metrics: { avgCycleHours: 12, avgResolutionHours: 30, tasksClosed: 20 },
};

describe("evaluateRule", () => {
  it("SLA_MIN passa quando slaFinal ≥ value", () => {
    expect(evaluateRule({ type: "SLA_MIN", value: 100 }, baseCtx)).toBe(true);
    expect(evaluateRule({ type: "SLA_MIN", value: 100 }, { ...baseCtx, slaFinal: 99.9 })).toBe(false);
  });

  it("POINTS_MIN_MONTH usa pontosMes", () => {
    expect(evaluateRule({ type: "POINTS_MIN_MONTH", value: 40 }, baseCtx)).toBe(true);
    expect(evaluateRule({ type: "POINTS_MIN_MONTH", value: 60 }, baseCtx)).toBe(false);
  });

  it("FIRST_MONTH_CLOSED só se nunca fechou antes", () => {
    expect(evaluateRule({ type: "FIRST_MONTH_CLOSED" }, baseCtx)).toBe(true);
    expect(
      evaluateRule({ type: "FIRST_MONTH_CLOSED" }, { ...baseCtx, hasClosedBefore: true }),
    ).toBe(false);
  });

  it("GOAL_HITS_IN_MONTH compara contagem", () => {
    expect(evaluateRule({ type: "GOAL_HITS_IN_MONTH", value: 3 }, baseCtx)).toBe(false);
    expect(
      evaluateRule({ type: "GOAL_HITS_IN_MONTH", value: 3 }, { ...baseCtx, goalHitsInMonth: 5 }),
    ).toBe(true);
  });

  it("CYCLE_HOURS_MAX exige métricas presentes e ciclo ≤ valor", () => {
    expect(evaluateRule({ type: "CYCLE_HOURS_MAX", value: 24 }, baseCtx)).toBe(true);
    expect(evaluateRule({ type: "CYCLE_HOURS_MAX", value: 8 }, baseCtx)).toBe(false);
    expect(
      evaluateRule({ type: "CYCLE_HOURS_MAX", value: 24 }, { ...baseCtx, metrics: null }),
    ).toBe(false);
  });

  it("RESOLUTION_HOURS_MAX exige métricas presentes e resolução ≤ valor", () => {
    expect(evaluateRule({ type: "RESOLUTION_HOURS_MAX", value: 48 }, baseCtx)).toBe(true);
    expect(evaluateRule({ type: "RESOLUTION_HOURS_MAX", value: 20 }, baseCtx)).toBe(false);
  });

  it("TASKS_CLOSED_MIN_MONTH usa metrics.tasksClosed", () => {
    expect(evaluateRule({ type: "TASKS_CLOSED_MIN_MONTH", value: 20 }, baseCtx)).toBe(true);
    expect(evaluateRule({ type: "TASKS_CLOSED_MIN_MONTH", value: 25 }, baseCtx)).toBe(false);
    expect(
      evaluateRule({ type: "TASKS_CLOSED_MIN_MONTH", value: 1 }, { ...baseCtx, metrics: null }),
    ).toBe(false);
  });

  it("regras com metrics.avgResolutionHours null falham", () => {
    expect(
      evaluateRule(
        { type: "RESOLUTION_HOURS_MAX", value: 48 },
        { ...baseCtx, metrics: { avgCycleHours: 12, avgResolutionHours: null, tasksClosed: 20 } },
      ),
    ).toBe(false);
  });
});

describe("evaluateMilestones", () => {
  const milestones: MilestoneLike[] = [
    { id: "1", rule: { type: "SLA_MIN", value: 100 } },
    { id: "2", rule: { type: "POINTS_MIN_MONTH", value: 40 } },
    { id: "3", rule: { type: "FIRST_MONTH_CLOSED" } },
    { id: "4", rule: null },
  ];

  it("retorna só os candidatos que batem a regra", () => {
    const hits = evaluateMilestones(milestones, baseCtx);
    expect(hits.map((h) => h.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("ignora candidato com rule null", () => {
    const hits = evaluateMilestones(milestones, baseCtx);
    expect(hits.find((h) => h.id === "4")).toBeUndefined();
  });

  it("FIRST_MONTH_CLOSED falha se já fechou antes", () => {
    const hits = evaluateMilestones(milestones, { ...baseCtx, hasClosedBefore: true });
    expect(hits.map((h) => h.id).sort()).toEqual(["1", "2"]);
  });
});
