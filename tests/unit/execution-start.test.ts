import { describe, it, expect } from "vitest";
import { findExecutionStartMs, normalizeStatusName } from "@/lib/clickup";

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
