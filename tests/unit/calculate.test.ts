import { describe, it, expect } from "vitest";
import { computePartial, type CalculateInputs } from "@/lib/calculate";

const baseInputs: CalculateInputs = {
  pontosMes: 10,
  slaMedioMes: 100,
  valorPorPonto: 50,
  valorDisponibilidade100: 1500,
  tiers: [
    { minPct: 100, payoutPct: 100 },
    { minPct: 99, payoutPct: 80 },
    { minPct: 95, payoutPct: 40 },
    { minPct: 0, payoutPct: 0 },
  ],
};

describe("computePartial", () => {
  it("SLA 100% paga bônus cheio + pontos", () => {
    const r = computePartial(baseInputs);
    expect(r.valorPontos).toBe(500);
    expect(r.valorDisponibilidade).toBe(1500);
    expect(r.valorParcial).toBe(2000);
  });

  it("SLA 99% aplica tier de 80%", () => {
    const r = computePartial({ ...baseInputs, slaMedioMes: 99 });
    expect(r.valorDisponibilidade).toBe(1200);
    expect(r.valorParcial).toBe(1700);
  });

  it("SLA 94% (abaixo do menor tier útil) zera bônus mas mantém pontos", () => {
    const r = computePartial({ ...baseInputs, slaMedioMes: 94 });
    expect(r.valorDisponibilidade).toBe(0);
    expect(r.valorPontos).toBe(500);
    expect(r.valorParcial).toBe(500);
  });

  it("zero pontos e SLA 0 retorna tudo zerado", () => {
    const r = computePartial({ ...baseInputs, pontosMes: 0, slaMedioMes: 0 });
    expect(r.valorPontos).toBe(0);
    expect(r.valorDisponibilidade).toBe(0);
    expect(r.valorParcial).toBe(0);
  });

  it("valores sempre arredondados para 2 casas", () => {
    const r = computePartial({ ...baseInputs, pontosMes: 3, valorPorPonto: 33.333 });
    expect(r.valorPontos).toBe(100);
  });
});
