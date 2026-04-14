import { describe, it, expect } from "vitest";
import {
  computeLevel,
  computeStreak,
  type SnapshotForStreak,
} from "@/lib/gamification";
import {
  evaluateAchievementsRules,
  evaluateRule,
  type AchievementContext,
  type AchievementLike,
} from "@/lib/achievement-rules";

describe("computeLevel", () => {
  it("0 XP = Bronze", () => {
    expect(computeLevel(0).name).toBe("Bronze");
  });
  it("sobe para Prata/Ouro/Platina conforme XP", () => {
    expect(computeLevel(200).name).toBe("Prata");
    expect(computeLevel(600).name).toBe("Ouro");
    expect(computeLevel(1500).name).toBe("Platina");
  });
});

describe("computeStreak", () => {
  const snaps: SnapshotForStreak[] = [
    { date: new Date("2026-04-01"), slaMedioMes: 100 },
    { date: new Date("2026-04-02"), slaMedioMes: 99.5 },
    { date: new Date("2026-04-03"), slaMedioMes: 99.2 },
    { date: new Date("2026-04-04"), slaMedioMes: 98.5 },
    { date: new Date("2026-04-05"), slaMedioMes: 100 },
  ];
  it("conta sequência final contígua acima da meta", () => {
    expect(computeStreak(snaps, 99)).toBe(1);
  });
  it("conta quando todos acima da meta", () => {
    expect(computeStreak(snaps.slice(0, 3), 99)).toBe(3);
  });
  it("zero quando último dia abaixo da meta", () => {
    expect(computeStreak([...snaps, { date: new Date("2026-04-06"), slaMedioMes: 90 }], 99)).toBe(0);
  });
});

const baseCtx: AchievementContext = {
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
    expect(evaluateRule({ type: "FIRST_MONTH_CLOSED" }, { ...baseCtx, hasClosedBefore: true })).toBe(false);
  });
  it("CYCLE_HOURS_MAX exige métricas presentes", () => {
    expect(evaluateRule({ type: "CYCLE_HOURS_MAX", value: 24 }, baseCtx)).toBe(true);
    expect(evaluateRule({ type: "CYCLE_HOURS_MAX", value: 8 }, baseCtx)).toBe(false);
    expect(
      evaluateRule({ type: "CYCLE_HOURS_MAX", value: 24 }, { ...baseCtx, metrics: null }),
    ).toBe(false);
  });
  it("GOAL_HITS_IN_MONTH compara contagem", () => {
    expect(evaluateRule({ type: "GOAL_HITS_IN_MONTH", value: 3 }, baseCtx)).toBe(false);
    expect(
      evaluateRule({ type: "GOAL_HITS_IN_MONTH", value: 3 }, { ...baseCtx, goalHitsInMonth: 5 }),
    ).toBe(true);
  });
});

describe("evaluateAchievementsRules", () => {
  const achievements: AchievementLike[] = [
    { id: "1", code: "SLA_100", rule: { type: "SLA_MIN", value: 100 } },
    { id: "2", code: "POINTS_GOAL", rule: { type: "POINTS_MIN_MONTH", value: 40 } },
    { id: "3", code: "FIRST_MONTH_CLOSED", rule: { type: "FIRST_MONTH_CLOSED" } },
    { id: "4", code: "MISSING_RULE", rule: null },
  ];

  it("desbloqueia tudo na primeira vez", () => {
    const result = evaluateAchievementsRules(achievements, baseCtx, new Set());
    const codes = result.map((r) => r.code);
    expect(codes).toContain("SLA_100");
    expect(codes).toContain("POINTS_GOAL");
    expect(codes).toContain("FIRST_MONTH_CLOSED");
    expect(codes).not.toContain("MISSING_RULE");
  });

  it("não re-desbloqueia se já está em alreadyUnlocked", () => {
    const result = evaluateAchievementsRules(
      achievements,
      baseCtx,
      new Set(["SLA_100", "POINTS_GOAL", "FIRST_MONTH_CLOSED"]),
    );
    expect(result).toEqual([]);
  });

  it("FIRST_MONTH_CLOSED não dispara se já fechou antes", () => {
    const result = evaluateAchievementsRules(
      achievements,
      { ...baseCtx, hasClosedBefore: true },
      new Set(),
    );
    expect(result.map((r) => r.code)).not.toContain("FIRST_MONTH_CLOSED");
  });
});
