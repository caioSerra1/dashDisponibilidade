/**
 * Helpers gerenciais puros pra dashboard/mural. Operam sobre dados já
 * buscados do banco ou do ClickUp — não fazem chamadas externas. Todos
 * são determinísticos e testáveis.
 */

import type { RichTask } from "./metrics";

// ---------- Backlog aging ----------

export const BACKLOG_BUCKETS = ["0-2d", "3-7d", "8-14d", "15-30d", ">30d"] as const;
export type BacklogBucket = (typeof BACKLOG_BUCKETS)[number];

export type BacklogAging = Record<BacklogBucket, number>;

const DAY_MS = 86_400_000;

/**
 * Histograma de idade (em dias) das tasks ainda abertas.
 * Ignora tasks já fechadas ou sem dateCreated.
 */
export function computeBacklogAging(
  openTasks: readonly Pick<RichTask, "dateCreated" | "dateClosed">[],
  now: number = Date.now(),
): BacklogAging {
  const result: BacklogAging = {
    "0-2d": 0,
    "3-7d": 0,
    "8-14d": 0,
    "15-30d": 0,
    ">30d": 0,
  };
  for (const t of openTasks) {
    if (t.dateClosed != null) continue;
    if (t.dateCreated == null) continue;
    const ageDays = (now - t.dateCreated) / DAY_MS;
    if (ageDays < 0) continue;
    if (ageDays <= 2) result["0-2d"] += 1;
    else if (ageDays <= 7) result["3-7d"] += 1;
    else if (ageDays <= 14) result["8-14d"] += 1;
    else if (ageDays <= 30) result["15-30d"] += 1;
    else result[">30d"] += 1;
  }
  return result;
}

// ---------- WIP ----------

/**
 * Conta quantas tasks da lista estão "em execução" AGORA (não fechadas e
 * status entre os configurados como execução). Puro — o caller filtra as
 * tasks do usuário antes de chamar.
 */
export function computeWIP(
  tasks: readonly RichTask[],
  executionStatuses: readonly string[],
): number {
  if (executionStatuses.length === 0) return 0;
  const normalized = new Set(executionStatuses.map((s) => normalize(s)));
  let wip = 0;
  for (const t of tasks) {
    if (t.dateClosed != null) continue;
    if (!t.status) continue;
    if (normalized.has(normalize(t.status))) wip += 1;
  }
  return wip;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// ---------- Team equity ----------

export type EquityLabel = "balanceada" | "levemente desigual" | "desigual";

export interface TeamEquity {
  /** Coeficiente de variação normalizado em 0..1 (0 = uniforme, 1+ = muito desigual). */
  score: number;
  label: EquityLabel;
}

/**
 * Mede quão equilibrada está a carga entre membros da equipe. Retorna o
 * coeficiente de variação (desvio padrão / média) como score normalizado.
 * Menos de 2 pessoas → sempre `balanceada`.
 */
export function computeTeamEquity(pointsByUser: readonly number[]): TeamEquity {
  if (pointsByUser.length < 2) return { score: 0, label: "balanceada" };
  const values = pointsByUser.filter((v) => Number.isFinite(v));
  if (values.length === 0) return { score: 0, label: "balanceada" };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return { score: 0, label: "balanceada" };
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;
  const score = Math.round(cv * 100) / 100;
  const label: EquityLabel =
    cv <= 0.2 ? "balanceada" : cv <= 0.4 ? "levemente desigual" : "desigual";
  return { score, label };
}

// ---------- Heatmap ----------

/**
 * Matriz 7×24 de contagem de tasks fechadas por dia-da-semana × hora.
 * `rows[0]` = segunda, `rows[6]` = domingo. Horas em UTC.
 */
export function computeHeatmap(
  tasks: readonly Pick<RichTask, "dateClosed">[],
): number[][] {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const t of tasks) {
    if (t.dateClosed == null) continue;
    const d = new Date(t.dateClosed);
    const dow = d.getUTCDay(); // 0=dom..6=sáb
    const mondayFirst = (dow + 6) % 7; // 0=seg..6=dom
    const hour = d.getUTCHours();
    const row = grid[mondayFirst]!;
    row[hour] = (row[hour] ?? 0) + 1;
  }
  return grid;
}

// ---------- Evolution ----------

export interface EvolutionInputMetrics {
  pontosDev: number;
  tasksDev: number;
  slaAvg: number;
  avgResolutionHours: number | null;
}

export interface Evolution {
  delta: {
    pontosDev: number;
    tasksDev: number;
    slaAvg: number;
    avgResolutionHours: number | null;
  };
  /** Score agregado: soma ponderada das melhorias. Pode ser negativo. */
  scoreEvolucao: number;
}

/**
 * Compara métricas do período atual com o período anterior. Score é uma
 * soma ponderada das melhorias percentuais pra comparar colaboradores.
 */
export function computeEvolution(
  current: EvolutionInputMetrics,
  previous: EvolutionInputMetrics,
): Evolution {
  const pontosDelta = current.pontosDev - previous.pontosDev;
  const tasksDelta = current.tasksDev - previous.tasksDev;
  const slaDelta = current.slaAvg - previous.slaAvg;
  const resolutionDelta =
    current.avgResolutionHours != null && previous.avgResolutionHours != null
      ? current.avgResolutionHours - previous.avgResolutionHours
      : null;

  // Normaliza cada delta pelo próprio valor anterior pra comparar grandezas
  // diferentes. Resolution é "menor é melhor", então invertemos.
  const pontosPct = previous.pontosDev > 0 ? pontosDelta / previous.pontosDev : pontosDelta > 0 ? 1 : 0;
  const tasksPct = previous.tasksDev > 0 ? tasksDelta / previous.tasksDev : tasksDelta > 0 ? 1 : 0;
  const slaPct = slaDelta / 100; // já é escala %
  const resolutionPct =
    resolutionDelta != null && previous.avgResolutionHours && previous.avgResolutionHours > 0
      ? -(resolutionDelta / previous.avgResolutionHours)
      : 0;

  // Pesos: pontos e tasks importam mais que SLA e resolução.
  const scoreEvolucao =
    0.4 * pontosPct + 0.3 * tasksPct + 0.15 * slaPct + 0.15 * resolutionPct;

  return {
    delta: {
      pontosDev: pontosDelta,
      tasksDev: tasksDelta,
      slaAvg: slaDelta,
      avgResolutionHours: resolutionDelta,
    },
    scoreEvolucao: Math.round(scoreEvolucao * 1000) / 1000,
  };
}

// ---------- Anomaly ----------

/**
 * Detecta se o último valor da série caiu significativamente abaixo da
 * média móvel anterior. `tolerance` é o multiplicador do desvio padrão.
 *
 * - Menos de 4 pontos anteriores → sem referência, retorna false.
 * - Só acusa anomalia pra baixo (queda). Melhoras não disparam alerta.
 */
export function detectAnomaly(
  series: readonly number[],
  tolerance: number = 1.5,
): boolean {
  if (series.length < 5) return false;
  const last = series[series.length - 1]!;
  const prior = series.slice(0, -1);
  const mean = prior.reduce((a, b) => a + b, 0) / prior.length;
  const variance = prior.reduce((acc, v) => acc + (v - mean) ** 2, 0) / prior.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return last < mean;
  return last < mean - tolerance * stdDev;
}
