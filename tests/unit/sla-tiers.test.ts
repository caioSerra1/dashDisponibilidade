import { describe, it, expect } from "vitest";
import { applySlaTiers, type SlaTier } from "@/lib/sla-tiers";

const tiers: SlaTier[] = [
  { minPct: 100, payoutPct: 100 },
  { minPct: 99, payoutPct: 80 },
  { minPct: 95, payoutPct: 40 },
  { minPct: 0, payoutPct: 0 },
];

describe("applySlaTiers", () => {
  it("retorna 100% exato no limite superior", () => {
    expect(applySlaTiers(100, tiers)).toBe(100);
  });

  it("cai no tier imediatamente abaixo quando não bate o de cima", () => {
    expect(applySlaTiers(99.9, tiers)).toBe(80);
  });

  it("escolhe o maior minPct que caiba no valor", () => {
    expect(applySlaTiers(97, tiers)).toBe(40);
    expect(applySlaTiers(95, tiers)).toBe(40);
  });

  it("cai no tier zero quando abaixo de todos os limiares relevantes", () => {
    expect(applySlaTiers(80, tiers)).toBe(0);
  });

  it("aceita tiers fora de ordem (implementação ordena)", () => {
    const shuffled: SlaTier[] = [
      { minPct: 95, payoutPct: 40 },
      { minPct: 100, payoutPct: 100 },
      { minPct: 0, payoutPct: 0 },
      { minPct: 99, payoutPct: 80 },
    ];
    expect(applySlaTiers(99.5, shuffled)).toBe(80);
    expect(applySlaTiers(100, shuffled)).toBe(100);
  });

  it("lida com lista vazia retornando 0", () => {
    expect(applySlaTiers(100, [])).toBe(0);
  });

  it("clampa valores fora de [0, 100]", () => {
    expect(applySlaTiers(150, tiers)).toBe(100);
    expect(applySlaTiers(-5, tiers)).toBe(0);
  });
});
