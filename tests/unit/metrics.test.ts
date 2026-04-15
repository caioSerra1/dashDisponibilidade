import { describe, it, expect } from "vitest";
import {
  computeTaskMetrics,
  classifyTask,
  type RichTask,
  type TaskClassificationConfig,
} from "@/lib/metrics";

const HOUR = 3600_000;
const NOW = new Date("2026-04-15T12:00:00Z").getTime();

const DEV_LIST = "L-DEV";
const SUPPORT_LIST = "L-SUP";
const SPRINTS_FOLDER = "F-SPRINTS";

const CONFIG: TaskClassificationConfig = {
  dev: { listIds: [DEV_LIST], folderIds: [SPRINTS_FOLDER] },
  support: { listIds: [SUPPORT_LIST], folderIds: [] },
};

function task(overrides: Partial<RichTask>): RichTask {
  return {
    id: "x",
    points: null,
    dateCreated: null,
    dateStarted: null,
    dateClosed: null,
    priority: null,
    tags: [],
    listId: DEV_LIST,
    folderId: null,
    returnedToExecution: 0,
    ...overrides,
  };
}

describe("classifyTask", () => {
  it("classifica como support se list_id bate em support.listIds", () => {
    expect(classifyTask({ listId: SUPPORT_LIST, folderId: null }, CONFIG)).toBe("support");
  });

  it("classifica como dev se list_id bate em dev.listIds", () => {
    expect(classifyTask({ listId: DEV_LIST, folderId: null }, CONFIG)).toBe("dev");
  });

  it("classifica como dev se folder_id bate em dev.folderIds (ex.: Sprints Semanais)", () => {
    expect(classifyTask({ listId: "outra-lista", folderId: SPRINTS_FOLDER }, CONFIG)).toBe("dev");
  });

  it("classifica como ignored quando nada bate", () => {
    expect(classifyTask({ listId: "qualquer-outro", folderId: null }, CONFIG)).toBe("ignored");
    expect(classifyTask({ listId: null, folderId: null }, CONFIG)).toBe("ignored");
  });

  it("suporte ganha precedência sobre dev em colisão de list_id", () => {
    const collision: TaskClassificationConfig = {
      dev: { listIds: ["colisao"], folderIds: [] },
      support: { listIds: ["colisao"], folderIds: [] },
    };
    expect(classifyTask({ listId: "colisao", folderId: null }, collision)).toBe("support");
  });
});

describe("computeTaskMetrics (totais + segmentado)", () => {
  it("lista vazia retorna zeros e nulls", () => {
    const r = computeTaskMetrics([], NOW, CONFIG);
    expect(r.tasksClosed).toBe(0);
    expect(r.pointsSum).toBe(0);
    expect(r.avgResolutionHours).toBeNull();
    expect(r.avgCycleHours).toBeNull();
    expect(r.byType.dev.tasksClosed).toBe(0);
    expect(r.byType.support.tasksClosed).toBe(0);
    expect(r.byType.ignored.tasksClosed).toBe(0);
  });

  it("ignora tasks abertas para tasksClosed mas conta pontos (DEV)", () => {
    const r = computeTaskMetrics(
      [
        task({ points: 5, dateClosed: null }),
        task({ points: 3, dateClosed: NOW - HOUR, dateCreated: NOW - 5 * HOUR }),
      ],
      NOW,
      CONFIG,
    );
    expect(r.tasksClosed).toBe(1);
    expect(r.pointsSum).toBe(8);
    expect(r.byType.dev.pointsSum).toBe(8);
  });

  it("avgResolutionHours em closed - created", () => {
    const r = computeTaskMetrics(
      [
        task({ dateClosed: NOW, dateCreated: NOW - 10 * HOUR }),
        task({ dateClosed: NOW, dateCreated: NOW - 20 * HOUR }),
      ],
      NOW,
      CONFIG,
    );
    expect(r.avgResolutionHours).toBe(15);
  });

  it("avgCycleHours só quando dateStarted existir", () => {
    const r = computeTaskMetrics(
      [
        task({ dateClosed: NOW, dateStarted: NOW - 4 * HOUR, dateCreated: NOW - 24 * HOUR }),
        task({ dateClosed: NOW, dateStarted: null, dateCreated: NOW - 12 * HOUR }),
      ],
      NOW,
      CONFIG,
    );
    expect(r.avgCycleHours).toBe(4);
  });

  it("priorityBreakdown agrega prioridades", () => {
    const r = computeTaskMetrics(
      [
        task({ dateClosed: NOW, priority: "urgent" }),
        task({ dateClosed: NOW, priority: "high" }),
        task({ dateClosed: NOW, priority: "high" }),
        task({ dateClosed: NOW, priority: null }),
      ],
      NOW,
      CONFIG,
    );
    expect(r.priorityBreakdown).toEqual({ urgent: 1, high: 2, normal: 0, low: 0 });
  });

  it("tagsBreakdown ordena por contagem desc", () => {
    const r = computeTaskMetrics(
      [
        task({ dateClosed: NOW, tags: ["bug", "infra"] }),
        task({ dateClosed: NOW, tags: ["bug"] }),
        task({ dateClosed: NOW, tags: ["infra", "deploy"] }),
      ],
      NOW,
      CONFIG,
    );
    expect(r.tagsBreakdown[0]).toEqual({ tag: "bug", count: 2 });
    expect(r.tagsBreakdown.find((t) => t.tag === "deploy")?.count).toBe(1);
  });

  it("throughputPerWeek conta closed nos últimos 7 dias", () => {
    const r = computeTaskMetrics(
      [
        task({ dateClosed: NOW - 1 * 24 * HOUR }),
        task({ dateClosed: NOW - 6 * 24 * HOUR }),
        task({ dateClosed: NOW - 10 * 24 * HOUR }),
      ],
      NOW,
      CONFIG,
    );
    expect(r.throughputPerWeek).toBe(2);
  });

  it("suporte é medido mas não pontua (pontos no total = só dev)", () => {
    const r = computeTaskMetrics(
      [
        task({ listId: DEV_LIST, points: 10, dateClosed: NOW, dateCreated: NOW - HOUR }),
        task({ listId: SUPPORT_LIST, points: 5, dateClosed: NOW, dateCreated: NOW - HOUR }),
      ],
      NOW,
      CONFIG,
    );
    expect(r.byType.dev.tasksClosed).toBe(1);
    expect(r.byType.support.tasksClosed).toBe(1);
    expect(r.byType.dev.pointsSum).toBe(10);
    expect(r.byType.support.pointsSum).toBe(5); // o segmento guarda o valor bruto
    expect(r.pointsSum).toBe(10); // mas o total da variável ignora suporte
    expect(r.tasksClosed).toBe(2); // totais contam dev + suporte
  });

  it("tasks ignoradas não entram nos totais", () => {
    const r = computeTaskMetrics(
      [
        task({ listId: DEV_LIST, dateClosed: NOW }),
        task({ listId: "lista-nao-mapeada", dateClosed: NOW }),
      ],
      NOW,
      CONFIG,
    );
    expect(r.tasksClosed).toBe(1);
    expect(r.byType.dev.tasksClosed).toBe(1);
    expect(r.byType.ignored.tasksClosed).toBe(1);
  });

  it("MTTA (avgAckHours) é calculado pra suporte (created → dateStarted)", () => {
    const r = computeTaskMetrics(
      [
        task({
          listId: SUPPORT_LIST,
          dateCreated: NOW - 10 * HOUR,
          dateStarted: NOW - 8 * HOUR,
          dateClosed: NOW - HOUR,
        }),
        task({
          listId: SUPPORT_LIST,
          dateCreated: NOW - 6 * HOUR,
          dateStarted: NOW - 2 * HOUR,
          dateClosed: NOW - HOUR,
        }),
      ],
      NOW,
      CONFIG,
    );
    // Task 1: 10-8=2h, Task 2: 6-2=4h, média = 3h
    expect(r.byType.support.avgAckHours).toBe(3);
  });

  it("retornos à execução agregados por tipo", () => {
    const r = computeTaskMetrics(
      [
        task({ listId: DEV_LIST, dateClosed: NOW, returnedToExecution: 2 }),
        task({ listId: DEV_LIST, dateClosed: NOW, returnedToExecution: 1 }),
        task({ listId: SUPPORT_LIST, dateClosed: NOW, returnedToExecution: 3 }),
      ],
      NOW,
      CONFIG,
    );
    expect(r.byType.dev.returnedToExecution).toBe(3);
    expect(r.byType.support.returnedToExecution).toBe(3);
    expect(r.returnedToExecution).toBe(6);
  });
});
