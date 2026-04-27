import { describe, expect, it } from "vitest";
import {
  computeWebAppSla,
  matchExpectStatus,
  type WebAppEventInterval,
} from "../../src/lib/web-monitor";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function ev(kind: "down" | "up", startedAt: Date, endedAt: Date | null = null): WebAppEventInterval {
  return { kind, startedAt, endedAt };
}

describe("computeWebAppSla", () => {
  const from = new Date("2026-04-01T00:00:00Z");
  const to = new Date("2026-04-30T23:59:59Z");
  const totalMs = to.getTime() - from.getTime();

  it("sem eventos = 100%", () => {
    expect(computeWebAppSla([], from, to)).toBe(100);
  });

  it("evento down inteiramente fora do período não conta", () => {
    const eventos = [
      ev(
        "down",
        new Date("2026-03-15T00:00:00Z"),
        new Date("2026-03-15T01:00:00Z"),
      ),
    ];
    expect(computeWebAppSla(eventos, from, to)).toBe(100);
  });

  it("evento down de 1h dentro do período: pct correto", () => {
    const inicio = new Date("2026-04-15T10:00:00Z");
    const fim = new Date("2026-04-15T11:00:00Z");
    const sla = computeWebAppSla([ev("down", inicio, fim)], from, to);
    const expected = ((totalMs - HOUR) / totalMs) * 100;
    expect(sla).toBe(Math.round(expected * 100) / 100);
  });

  it("evento ainda aberto (endedAt = null) conta até `to`", () => {
    const inicio = new Date(to.getTime() - 2 * HOUR);
    const sla = computeWebAppSla([ev("down", inicio, null)], from, to);
    const expected = ((totalMs - 2 * HOUR) / totalMs) * 100;
    expect(sla).toBe(Math.round(expected * 100) / 100);
  });

  it("evento que começa antes do período é cortado em `from`", () => {
    const inicio = new Date(from.getTime() - DAY);
    const fim = new Date(from.getTime() + 2 * HOUR);
    const sla = computeWebAppSla([ev("down", inicio, fim)], from, to);
    // Só conta as 2h dentro do período
    const expected = ((totalMs - 2 * HOUR) / totalMs) * 100;
    expect(sla).toBe(Math.round(expected * 100) / 100);
  });

  it("evento que termina depois do período é cortado em `to`", () => {
    const inicio = new Date(to.getTime() - 3 * HOUR);
    const fim = new Date(to.getTime() + DAY);
    const sla = computeWebAppSla([ev("down", inicio, fim)], from, to);
    const expected = ((totalMs - 3 * HOUR) / totalMs) * 100;
    expect(sla).toBe(Math.round(expected * 100) / 100);
  });

  it("eventos kind=up são ignorados", () => {
    const eventos = [
      ev(
        "up",
        new Date("2026-04-15T10:00:00Z"),
        new Date("2026-04-15T20:00:00Z"),
      ),
    ];
    expect(computeWebAppSla(eventos, from, to)).toBe(100);
  });

  it("múltiplos eventos down somam", () => {
    const eventos = [
      ev(
        "down",
        new Date("2026-04-10T00:00:00Z"),
        new Date("2026-04-10T01:00:00Z"),
      ),
      ev(
        "down",
        new Date("2026-04-20T00:00:00Z"),
        new Date("2026-04-20T02:00:00Z"),
      ),
    ];
    const sla = computeWebAppSla(eventos, from, to);
    const expected = ((totalMs - 3 * HOUR) / totalMs) * 100;
    expect(sla).toBe(Math.round(expected * 100) / 100);
  });

  it("100% downtime = 0%", () => {
    const sla = computeWebAppSla([ev("down", from, to)], from, to);
    expect(sla).toBe(0);
  });

  it("clamp inferior: downtime maior que período não vai abaixo de 0", () => {
    const inicio = new Date(from.getTime() - DAY);
    const fim = new Date(to.getTime() + DAY);
    const sla = computeWebAppSla([ev("down", inicio, fim)], from, to);
    expect(sla).toBe(0);
  });
});

describe("matchExpectStatus", () => {
  it("'2xx' aceita 200-299", () => {
    expect(matchExpectStatus(200, "2xx")).toBe(true);
    expect(matchExpectStatus(204, "2xx")).toBe(true);
    expect(matchExpectStatus(299, "2xx")).toBe(true);
    expect(matchExpectStatus(300, "2xx")).toBe(false);
    expect(matchExpectStatus(199, "2xx")).toBe(false);
  });

  it("'3xx' aceita 300-399", () => {
    expect(matchExpectStatus(301, "3xx")).toBe(true);
    expect(matchExpectStatus(399, "3xx")).toBe(true);
    expect(matchExpectStatus(400, "3xx")).toBe(false);
  });

  it("status exato (CSV)", () => {
    expect(matchExpectStatus(200, "200")).toBe(true);
    expect(matchExpectStatus(301, "200,301,302")).toBe(true);
    expect(matchExpectStatus(404, "200,301,302")).toBe(false);
  });

  it("combinação de classes e exatos", () => {
    expect(matchExpectStatus(200, "2xx,3xx")).toBe(true);
    expect(matchExpectStatus(301, "2xx,3xx")).toBe(true);
    expect(matchExpectStatus(401, "2xx,3xx,401")).toBe(true);
    expect(matchExpectStatus(500, "2xx,3xx")).toBe(false);
  });

  it("expressão vazia = só 2xx", () => {
    expect(matchExpectStatus(200, "")).toBe(true);
    expect(matchExpectStatus(404, "")).toBe(false);
  });
});
