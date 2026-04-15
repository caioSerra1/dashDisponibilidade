import { describe, it, expect } from "vitest";
import {
  computeBacklogAging,
  computeWIP,
  computeTeamEquity,
  computeHeatmap,
  computeEvolution,
  detectAnomaly,
} from "@/lib/team-metrics";

const DAY = 86_400_000;
const NOW = new Date("2026-04-15T12:00:00Z").getTime();

describe("computeBacklogAging", () => {
  const open = (ageDays: number) => ({
    dateCreated: NOW - ageDays * DAY,
    dateClosed: null,
  });

  it("distribui por bucket corretamente", () => {
    const r = computeBacklogAging(
      [open(0), open(2), open(3), open(7), open(8), open(14), open(15), open(30), open(45)],
      NOW,
    );
    expect(r).toEqual({
      "0-2d": 2,
      "3-7d": 2,
      "8-14d": 2,
      "15-30d": 2,
      ">30d": 1,
    });
  });

  it("ignora tasks fechadas", () => {
    const r = computeBacklogAging(
      [
        { dateCreated: NOW - 5 * DAY, dateClosed: NOW - DAY },
        { dateCreated: NOW - 5 * DAY, dateClosed: null },
      ],
      NOW,
    );
    expect(r["3-7d"]).toBe(1);
  });

  it("ignora tasks sem dateCreated", () => {
    const r = computeBacklogAging(
      [{ dateCreated: null, dateClosed: null }],
      NOW,
    );
    expect(Object.values(r).reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("computeWIP", () => {
  const exec = ["em execução", "in progress"];

  it("conta tasks abertas cujo status está em execução", () => {
    const tasks = [
      { id: "1", status: "em execução", dateClosed: null } as never,
      { id: "2", status: "Em Execução", dateClosed: null } as never,
      { id: "3", status: "to do", dateClosed: null } as never,
      { id: "4", status: "in progress", dateClosed: null } as never,
    ];
    expect(computeWIP(tasks, exec)).toBe(3);
  });

  it("ignora tasks fechadas mesmo se o status era de execução", () => {
    const tasks = [
      { id: "1", status: "em execução", dateClosed: NOW } as never,
    ];
    expect(computeWIP(tasks, exec)).toBe(0);
  });

  it("0 quando executionStatuses vazia", () => {
    const tasks = [{ id: "1", status: "em execução", dateClosed: null } as never];
    expect(computeWIP(tasks, [])).toBe(0);
  });
});

describe("computeTeamEquity", () => {
  it("balanceada quando todos iguais", () => {
    const e = computeTeamEquity([10, 10, 10, 10]);
    expect(e.label).toBe("balanceada");
    expect(e.score).toBe(0);
  });

  it("desigual quando um puxa tudo", () => {
    const e = computeTeamEquity([100, 10, 10, 10]);
    expect(e.label).toBe("desigual");
    expect(e.score).toBeGreaterThan(0.4);
  });

  it("< 2 membros retorna balanceada", () => {
    expect(computeTeamEquity([]).label).toBe("balanceada");
    expect(computeTeamEquity([50]).label).toBe("balanceada");
  });

  it("média 0 retorna balanceada (evita divisão por zero)", () => {
    expect(computeTeamEquity([0, 0, 0]).label).toBe("balanceada");
  });
});

describe("computeHeatmap", () => {
  it("retorna matriz 7x24 zerada quando sem dados", () => {
    const grid = computeHeatmap([]);
    expect(grid).toHaveLength(7);
    expect(grid[0]).toHaveLength(24);
    expect(grid.flat().reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("registra task na posição correta", () => {
    // 2026-04-15 é quarta-feira (dow=3), 12h UTC
    const tasks = [{ dateClosed: new Date("2026-04-15T12:00:00Z").getTime() }];
    const grid = computeHeatmap(tasks);
    // seg=0, ter=1, qua=2; dow 3 (qua) → row 2
    expect(grid[2]![12]).toBe(1);
  });

  it("domingo vira row 6 no layout seg-first", () => {
    const tasks = [{ dateClosed: new Date("2026-04-12T09:00:00Z").getTime() }];
    const grid = computeHeatmap(tasks);
    expect(grid[6]![9]).toBe(1);
  });

  it("ignora tasks sem dateClosed", () => {
    const grid = computeHeatmap([{ dateClosed: null }]);
    expect(grid.flat().reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("computeEvolution", () => {
  it("positive score quando melhorou em pontos e tasks", () => {
    const e = computeEvolution(
      { pontosDev: 50, tasksDev: 20, slaAvg: 99, avgResolutionHours: 20 },
      { pontosDev: 40, tasksDev: 16, slaAvg: 98, avgResolutionHours: 24 },
    );
    expect(e.delta.pontosDev).toBe(10);
    expect(e.delta.tasksDev).toBe(4);
    expect(e.scoreEvolucao).toBeGreaterThan(0);
  });

  it("negative score quando piorou em tudo", () => {
    const e = computeEvolution(
      { pontosDev: 30, tasksDev: 10, slaAvg: 97, avgResolutionHours: 30 },
      { pontosDev: 50, tasksDev: 20, slaAvg: 99, avgResolutionHours: 20 },
    );
    expect(e.scoreEvolucao).toBeLessThan(0);
  });

  it("resolução menor = melhora (contribui positivo)", () => {
    const e = computeEvolution(
      { pontosDev: 50, tasksDev: 20, slaAvg: 99, avgResolutionHours: 10 },
      { pontosDev: 50, tasksDev: 20, slaAvg: 99, avgResolutionHours: 20 },
    );
    expect(e.delta.avgResolutionHours).toBe(-10);
    expect(e.scoreEvolucao).toBeGreaterThan(0);
  });

  it("resolução null em um dos lados zera a contribuição sem quebrar", () => {
    const e = computeEvolution(
      { pontosDev: 50, tasksDev: 20, slaAvg: 99, avgResolutionHours: null },
      { pontosDev: 40, tasksDev: 16, slaAvg: 98, avgResolutionHours: 20 },
    );
    expect(e.delta.avgResolutionHours).toBeNull();
    expect(e.scoreEvolucao).toBeGreaterThan(0);
  });
});

describe("detectAnomaly", () => {
  it("série pequena demais → false", () => {
    expect(detectAnomaly([10, 10, 10])).toBe(false);
  });

  it("último valor estável → false", () => {
    expect(detectAnomaly([10, 11, 10, 9, 10])).toBe(false);
  });

  it("último valor muito abaixo → true", () => {
    expect(detectAnomaly([50, 52, 48, 51, 10])).toBe(true);
  });

  it("melhora (valor muito acima) NÃO dispara", () => {
    expect(detectAnomaly([10, 11, 9, 12, 100])).toBe(false);
  });

  it("stdDev zero e último menor dispara", () => {
    expect(detectAnomaly([10, 10, 10, 10, 5])).toBe(true);
  });
});
