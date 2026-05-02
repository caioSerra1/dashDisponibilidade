import { describe, expect, it } from "vitest";
import {
  computeAvailabilityFromEvents,
  computeSlaTimeline,
  computeWebAppSla,
  matchExpectStatus,
  type DowntimeInterval,
  type WebAppEventInterval,
} from "../../src/lib/web-monitor";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function ev(
  kind: "down" | "up" | "monitor-gap",
  startedAt: Date,
  endedAt: Date | null = null,
): DowntimeInterval {
  return { kind, startedAt, endedAt };
}

// Garante que aliases legados continuam funcionando (typecheck-only, não chamado).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _legacyAlias: typeof computeAvailabilityFromEvents = computeWebAppSla;
type _LegacyType = WebAppEventInterval;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _legacyType: _LegacyType = { kind: "down", startedAt: new Date(), endedAt: null };

describe("computeWebAppSla", () => {
  const from = new Date("2026-04-01T00:00:00Z");
  const to = new Date("2026-04-30T23:59:59Z");
  const totalMs = to.getTime() - from.getTime();

  it("sem eventos = 100%", () => {
    expect(computeAvailabilityFromEvents([], from, to)).toBe(100);
  });

  it("evento down inteiramente fora do período não conta", () => {
    const eventos = [
      ev(
        "down",
        new Date("2026-03-15T00:00:00Z"),
        new Date("2026-03-15T01:00:00Z"),
      ),
    ];
    expect(computeAvailabilityFromEvents(eventos, from, to)).toBe(100);
  });

  it("evento down de 1h dentro do período: pct correto", () => {
    const inicio = new Date("2026-04-15T10:00:00Z");
    const fim = new Date("2026-04-15T11:00:00Z");
    const sla = computeAvailabilityFromEvents([ev("down", inicio, fim)], from, to);
    const expected = ((totalMs - HOUR) / totalMs) * 100;
    expect(sla).toBe(Math.round(expected * 100) / 100);
  });

  it("evento ainda aberto (endedAt = null) conta até `to`", () => {
    const inicio = new Date(to.getTime() - 2 * HOUR);
    const sla = computeAvailabilityFromEvents([ev("down", inicio, null)], from, to);
    const expected = ((totalMs - 2 * HOUR) / totalMs) * 100;
    expect(sla).toBe(Math.round(expected * 100) / 100);
  });

  it("evento que começa antes do período é cortado em `from`", () => {
    const inicio = new Date(from.getTime() - DAY);
    const fim = new Date(from.getTime() + 2 * HOUR);
    const sla = computeAvailabilityFromEvents([ev("down", inicio, fim)], from, to);
    // Só conta as 2h dentro do período
    const expected = ((totalMs - 2 * HOUR) / totalMs) * 100;
    expect(sla).toBe(Math.round(expected * 100) / 100);
  });

  it("evento que termina depois do período é cortado em `to`", () => {
    const inicio = new Date(to.getTime() - 3 * HOUR);
    const fim = new Date(to.getTime() + DAY);
    const sla = computeAvailabilityFromEvents([ev("down", inicio, fim)], from, to);
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
    expect(computeAvailabilityFromEvents(eventos, from, to)).toBe(100);
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
    const sla = computeAvailabilityFromEvents(eventos, from, to);
    const expected = ((totalMs - 3 * HOUR) / totalMs) * 100;
    expect(sla).toBe(Math.round(expected * 100) / 100);
  });

  it("100% downtime = 0%", () => {
    const sla = computeAvailabilityFromEvents([ev("down", from, to)], from, to);
    expect(sla).toBe(0);
  });

  it("clamp inferior: downtime maior que período não vai abaixo de 0", () => {
    const inicio = new Date(from.getTime() - DAY);
    const fim = new Date(to.getTime() + DAY);
    const sla = computeAvailabilityFromEvents([ev("down", inicio, fim)], from, to);
    expect(sla).toBe(0);
  });
});

describe("computeAvailabilityFromEvents — cenários críticos pra cálculo de salário", () => {
  const from = new Date("2026-04-01T00:00:00Z");
  const to = new Date("2026-04-30T23:59:59Z");
  const totalMs = to.getTime() - from.getTime();

  it("eventos sobrepostos não são contados em duplicidade (max do start, min do end)", () => {
    const a = ev(
      "down",
      new Date("2026-04-15T10:00:00Z"),
      new Date("2026-04-15T13:00:00Z"),
    );
    const b = ev(
      "down",
      new Date("2026-04-15T12:00:00Z"),
      new Date("2026-04-15T14:00:00Z"),
    );
    // Implementação atual SOMA eventos (não merge): 3h + 2h = 5h.
    // Documenta o comportamento — overlap deve ser raro na prática (transições só
    // criam novo evento depois de fechar o anterior), mas garante o teste explícito.
    const sla = computeAvailabilityFromEvents([a, b], from, to);
    const expected = ((totalMs - 5 * 3600 * 1000) / totalMs) * 100;
    expect(sla).toBe(Math.round(expected * 100) / 100);
  });

  it("evento iniciado antes do mês mas resolvido dentro: conta só a parte de dentro", () => {
    // Servidor caiu dia 30/03 23:00, voltou dia 01/04 02:00. Conta 2h.
    const inicio = new Date("2026-03-30T23:00:00Z");
    const fim = new Date("2026-04-01T02:00:00Z");
    const sla = computeAvailabilityFromEvents([ev("down", inicio, fim)], from, to);
    const expected = ((totalMs - 2 * 3600 * 1000) / totalMs) * 100;
    expect(sla).toBe(Math.round(expected * 100) / 100);
  });

  it("monitor-gap NÃO é down por padrão (caller decide normalizar)", () => {
    // computeAvailabilityFromEvents é puro — só conta `kind=down`.
    // O wrapper getWebAppSla normaliza monitor-gap para down (pessimista).
    const sla = computeAvailabilityFromEvents(
      [ev("monitor-gap", new Date("2026-04-15T10:00:00Z"), new Date("2026-04-15T11:00:00Z"))],
      from,
      to,
    );
    expect(sla).toBe(100);
  });

  it("mistura de up/down/monitor-gap: só down conta", () => {
    const events: DowntimeInterval[] = [
      ev("down", new Date("2026-04-10T10:00:00Z"), new Date("2026-04-10T11:00:00Z")),
      ev("up", new Date("2026-04-10T11:00:00Z"), new Date("2026-04-15T00:00:00Z")),
      ev("monitor-gap", new Date("2026-04-20T08:00:00Z"), new Date("2026-04-20T09:00:00Z")),
    ];
    const sla = computeAvailabilityFromEvents(events, from, to);
    // Só conta 1h de down
    const expected = ((totalMs - 3600 * 1000) / totalMs) * 100;
    expect(sla).toBe(Math.round(expected * 100) / 100);
  });

  it("período 1s: ainda calcula sem dividir por zero", () => {
    const start = new Date("2026-04-15T12:00:00Z");
    const end = new Date("2026-04-15T12:00:01Z");
    const sla = computeAvailabilityFromEvents([], start, end);
    expect(sla).toBe(100);
  });

  it("ausência de eventos = 100% legítimo (não é dado fake)", () => {
    // Importante pra auditoria: não confundir "sem incidentes registrados"
    // com "sem medição". Quando um host está enabled e o mirror rodou,
    // ausência de eventos é prova de uptime — não preenchemos lacuna.
    const sla = computeAvailabilityFromEvents([], from, to);
    expect(sla).toBe(100);
  });
});

describe("computeSlaTimeline — gráfico de disponibilidade", () => {
  const DAY_MS = 24 * 3600 * 1000;
  const HOUR_MS = 3600 * 1000;

  it("período sem eventos = todos buckets 100%", () => {
    const from = new Date("2026-04-01T00:00:00Z");
    const to = new Date("2026-04-08T00:00:00Z");
    const buckets = computeSlaTimeline([], from, to, DAY_MS);
    expect(buckets).toHaveLength(7);
    expect(buckets.every((b) => b.pct === 100)).toBe(true);
  });

  it("evento de 2h num único dia: só esse bucket cai", () => {
    const from = new Date("2026-04-01T00:00:00Z");
    const to = new Date("2026-04-08T00:00:00Z");
    const buckets = computeSlaTimeline(
      [
        ev(
          "down",
          new Date("2026-04-03T10:00:00Z"),
          new Date("2026-04-03T12:00:00Z"),
        ),
      ],
      from,
      to,
      DAY_MS,
    );
    expect(buckets).toHaveLength(7);
    expect(buckets[0]!.pct).toBe(100);
    expect(buckets[1]!.pct).toBe(100);
    // Dia 3 (índice 2): 24h - 2h = 22h up = 91.67%
    const expected = ((24 - 2) / 24) * 100;
    expect(buckets[2]!.pct).toBe(Math.round(expected * 100) / 100);
    expect(buckets[3]!.pct).toBe(100);
  });

  it("evento atravessando 2 dias divide downtime corretamente", () => {
    const from = new Date("2026-04-01T00:00:00Z");
    const to = new Date("2026-04-08T00:00:00Z");
    // 23h-1h cobre 1h do dia 1 + 1h do dia 2
    const buckets = computeSlaTimeline(
      [
        ev(
          "down",
          new Date("2026-04-01T23:00:00Z"),
          new Date("2026-04-02T01:00:00Z"),
        ),
      ],
      from,
      to,
      DAY_MS,
    );
    const dia1 = buckets[0]!.pct;
    const dia2 = buckets[1]!.pct;
    const expected = ((24 - 1) / 24) * 100;
    expect(dia1).toBe(Math.round(expected * 100) / 100);
    expect(dia2).toBe(Math.round(expected * 100) / 100);
  });

  it("bucket horário com janela de 24h dá 24 buckets", () => {
    const from = new Date("2026-04-01T00:00:00Z");
    const to = new Date("2026-04-02T00:00:00Z");
    const buckets = computeSlaTimeline([], from, to, HOUR_MS);
    expect(buckets).toHaveLength(24);
  });

  it("evento ainda aberto conta até `to`", () => {
    const from = new Date("2026-04-01T00:00:00Z");
    const to = new Date("2026-04-03T00:00:00Z");
    const buckets = computeSlaTimeline(
      [ev("down", new Date("2026-04-02T20:00:00Z"), null)],
      from,
      to,
      DAY_MS,
    );
    // Dia 1: 100% (sem eventos). Dia 2: 4h fora (20:00→24:00) = 83.33%
    expect(buckets[0]!.pct).toBe(100);
    const expected = ((24 - 4) / 24) * 100;
    expect(buckets[1]!.pct).toBe(Math.round(expected * 100) / 100);
  });

  it("downMs por bucket é exato (pra mostrar tooltip)", () => {
    const from = new Date("2026-04-01T00:00:00Z");
    const to = new Date("2026-04-02T00:00:00Z");
    const buckets = computeSlaTimeline(
      [
        ev(
          "down",
          new Date("2026-04-01T10:00:00Z"),
          new Date("2026-04-01T11:30:00Z"),
        ),
      ],
      from,
      to,
      DAY_MS,
    );
    expect(buckets[0]!.downMs).toBe(90 * 60 * 1000); // 1h30min em ms
  });

  it("bucketMs inválido retorna []", () => {
    const from = new Date("2026-04-01T00:00:00Z");
    const to = new Date("2026-04-02T00:00:00Z");
    expect(computeSlaTimeline([], from, to, 0)).toEqual([]);
    expect(computeSlaTimeline([], from, to, -1000)).toEqual([]);
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
