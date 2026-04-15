import { describe, it, expect } from "vitest";
import {
  findExecutionStartMs,
  normalizeStatusName,
  countReturnsToExecution,
} from "@/lib/clickup";

describe("normalizeStatusName", () => {
  it("remove acentos e converte minúsculas", () => {
    expect(normalizeStatusName("Em Execução")).toBe("em execucao");
    expect(normalizeStatusName("  EM EXECUÇÃO  ")).toBe("em execucao");
    expect(normalizeStatusName("In Progress")).toBe("in progress");
  });
});

describe("findExecutionStartMs", () => {
  const baseTs = 1_700_000_000_000;
  const history = [
    { status: "to do", sinceMs: baseTs, totalMs: 60_000 },
    { status: "Em Execução", sinceMs: baseTs + 60_000, totalMs: 120_000 },
    { status: "review", sinceMs: baseTs + 180_000, totalMs: 60_000 },
  ];

  it("retorna o sinceMs do primeiro status que bate (case insensitive + acento)", () => {
    const ms = findExecutionStartMs(history, null, ["em execucao"]);
    expect(ms).toBe(baseTs + 60_000);
  });

  it("aceita match com nome diferente mas equivalente após normalizar", () => {
    expect(findExecutionStartMs(history, null, ["EM EXECUÇÃO"])).toBe(baseTs + 60_000);
  });

  it("considera o status atual também", () => {
    const current = { status: "doing", sinceMs: baseTs + 240_000, totalMs: 0 };
    const semHistorico: typeof history = [];
    expect(findExecutionStartMs(semHistorico, current, ["doing"])).toBe(baseTs + 240_000);
  });

  it("retorna o mais antigo quando há múltiplas entradas válidas", () => {
    const multi = [
      { status: "in progress", sinceMs: baseTs + 500_000, totalMs: 0 },
      { status: "in progress", sinceMs: baseTs + 100_000, totalMs: 0 },
    ];
    expect(findExecutionStartMs(multi, null, ["in progress"])).toBe(baseTs + 100_000);
  });

  it("retorna null se nunca passou por nenhum status pedido", () => {
    expect(findExecutionStartMs(history, null, ["nada-disso"])).toBeNull();
  });

  it("retorna null se a lista de execução está vazia", () => {
    expect(findExecutionStartMs(history, null, [])).toBeNull();
  });
});

describe("countReturnsToExecution", () => {
  const base = 1_700_000_000_000;
  const exec = ["em execução"];

  it("0 retornos quando a task passou uma única vez por execução", () => {
    const hist = [
      { status: "to do", sinceMs: base, totalMs: 0 },
      { status: "em execução", sinceMs: base + 60_000, totalMs: 0 },
      { status: "concluído", sinceMs: base + 120_000, totalMs: 0 },
    ];
    expect(countReturnsToExecution(hist, null, exec)).toBe(0);
  });

  it("conta 1 retorno quando volta pra execução uma vez", () => {
    const hist = [
      { status: "to do", sinceMs: base, totalMs: 0 },
      { status: "em execução", sinceMs: base + 60_000, totalMs: 0 },
      { status: "em teste", sinceMs: base + 120_000, totalMs: 0 },
      { status: "em execução", sinceMs: base + 180_000, totalMs: 0 },
      { status: "concluído", sinceMs: base + 240_000, totalMs: 0 },
    ];
    expect(countReturnsToExecution(hist, null, exec)).toBe(1);
  });

  it("conta 2 retornos quando volta duas vezes", () => {
    const hist = [
      { status: "em execução", sinceMs: base, totalMs: 0 },
      { status: "em teste", sinceMs: base + 1, totalMs: 0 },
      { status: "em execução", sinceMs: base + 2, totalMs: 0 },
      { status: "em review", sinceMs: base + 3, totalMs: 0 },
      { status: "em execução", sinceMs: base + 4, totalMs: 0 },
    ];
    expect(countReturnsToExecution(hist, null, exec)).toBe(2);
  });

  it("ignora entradas consecutivas no mesmo status", () => {
    const hist = [
      { status: "em execução", sinceMs: base, totalMs: 0 },
      { status: "em execução", sinceMs: base + 1, totalMs: 0 },
      { status: "concluído", sinceMs: base + 2, totalMs: 0 },
    ];
    expect(countReturnsToExecution(hist, null, exec)).toBe(0);
  });

  it("retorna 0 quando executionStatuses vazia", () => {
    const hist = [{ status: "em execução", sinceMs: base, totalMs: 0 }];
    expect(countReturnsToExecution(hist, null, [])).toBe(0);
  });

  it("considera current_status também", () => {
    const hist = [
      { status: "em execução", sinceMs: base, totalMs: 0 },
      { status: "em teste", sinceMs: base + 1, totalMs: 0 },
    ];
    const current = { status: "em execução", sinceMs: base + 2, totalMs: 0 };
    expect(countReturnsToExecution(hist, current, exec)).toBe(1);
  });
});
