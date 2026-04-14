import { describe, it, expect } from "vitest";
import { computeTaskMetrics, type RichTask } from "@/lib/metrics";

const HOUR = 3600_000;
const NOW = new Date("2026-04-15T12:00:00Z").getTime();

function task(overrides: Partial<RichTask>): RichTask {
  return {
    id: "x",
    points: null,
    dateCreated: null,
    dateStarted: null,
    dateClosed: null,
    priority: null,
    tags: [],
    ...overrides,
  };
}

describe("computeTaskMetrics", () => {
  it("lista vazia retorna zeros e nulls", () => {
    const r = computeTaskMetrics([], NOW);
    expect(r.tasksClosed).toBe(0);
    expect(r.pointsSum).toBe(0);
    expect(r.avgResolutionHours).toBeNull();
    expect(r.avgCycleHours).toBeNull();
  });

  it("ignora tasks abertas para tasksClosed mas conta pontos", () => {
    const r = computeTaskMetrics(
      [
        task({ points: 5, dateClosed: null }),
        task({ points: 3, dateClosed: NOW - HOUR, dateCreated: NOW - 5 * HOUR }),
      ],
      NOW,
    );
    expect(r.tasksClosed).toBe(1);
    expect(r.pointsSum).toBe(8);
  });

  it("avgResolutionHours em closed - created", () => {
    const r = computeTaskMetrics(
      [
        task({ dateClosed: NOW, dateCreated: NOW - 10 * HOUR }),
        task({ dateClosed: NOW, dateCreated: NOW - 20 * HOUR }),
      ],
      NOW,
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
    );
    expect(r.throughputPerWeek).toBe(2);
  });
});
