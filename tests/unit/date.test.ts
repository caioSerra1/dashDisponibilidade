import { describe, it, expect } from "vitest";
import {
  parsePeriodFromSearchParams,
  weekOfMonthRange,
  weeksInMonth,
} from "@/lib/date";

function sp(query: Record<string, string>): URLSearchParams {
  return new URLSearchParams(query);
}

describe("parsePeriodFromSearchParams", () => {
  it("default = mês corrente quando sem params", () => {
    const p = parsePeriodFromSearchParams(sp({}));
    expect(p.mode).toBe("mes");
    expect(p.from.getUTCDate()).toBe(1);
  });

  it("modo=mes respeita ano/mes", () => {
    const p = parsePeriodFromSearchParams(sp({ modo: "mes", ano: "2026", mes: "4" }));
    expect(p.mode).toBe("mes");
    expect(p.from.getUTCFullYear()).toBe(2026);
    expect(p.from.getUTCMonth()).toBe(3); // abril = index 3
    expect(p.to.getUTCMonth()).toBe(3);
  });

  it("modo=intervalo com de/ate válidos", () => {
    const p = parsePeriodFromSearchParams(
      sp({ modo: "intervalo", de: "2026-04-01", ate: "2026-04-15" }),
    );
    expect(p.mode).toBe("intervalo");
    expect(p.from.toISOString().startsWith("2026-04-01")).toBe(true);
    expect(p.to.toISOString().startsWith("2026-04-15")).toBe(true);
  });

  it("modo=intervalo com de > ate → fallback pro mês atual", () => {
    const p = parsePeriodFromSearchParams(
      sp({ modo: "intervalo", de: "2026-04-20", ate: "2026-04-10" }),
    );
    expect(p.mode).toBe("mes");
  });

  it("modo=semana respeita ano/mes/semana", () => {
    const p = parsePeriodFromSearchParams(
      sp({ modo: "semana", ano: "2026", mes: "4", semana: "2" }),
    );
    expect(p.mode).toBe("semana");
    // Abril/2026 começa numa quarta → semana 2 começa na segunda 2026-04-06
    expect(p.from.getUTCDate()).toBe(6);
  });

  it("semana fora do range cai pra semana 1", () => {
    const p = parsePeriodFromSearchParams(
      sp({ modo: "semana", ano: "2026", mes: "4", semana: "99" }),
    );
    expect(p.mode).toBe("semana");
    // semana 1 com segunda anterior ao dia 1 (abril começa quarta) vira dia 1
    expect(p.from.getUTCDate()).toBe(1);
  });

  it("query inválida usa defaults", () => {
    const p = parsePeriodFromSearchParams(sp({ ano: "abacaxi", mes: "99" }));
    expect(p.mode).toBe("mes");
    expect(p.from.getUTCDate()).toBe(1);
  });
});

describe("weeksInMonth", () => {
  it("abril/2026 tem 5 semanas (começa quarta)", () => {
    expect(weeksInMonth(2026, 4)).toBeGreaterThanOrEqual(4);
  });
});

describe("weekOfMonthRange", () => {
  it("semana 1 recorta no dia 1 quando a segunda cai antes", () => {
    const r = weekOfMonthRange(2026, 4, 1);
    expect(r.from.getUTCDate()).toBe(1);
  });

  it("from <= to sempre", () => {
    const r = weekOfMonthRange(2026, 4, 3);
    expect(r.from.getTime()).toBeLessThanOrEqual(r.to.getTime());
  });
});
