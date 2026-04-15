import { describe, it, expect } from "vitest";
import { computeStreak, type SnapshotForStreak } from "@/lib/gamification";

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
