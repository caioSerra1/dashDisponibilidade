import type { GoalKind, GoalPeriod } from "@prisma/client";

export interface GoalLike {
  id: string;
  kind: GoalKind;
  period: GoalPeriod;
  target: number;
  coinsReward: number;
  active: boolean;
}

export interface GoalMetricsCtx {
  pontosMes: number;
  tasksClosedMonth: number;
  slaMedioMes: number;
  avgResolutionHoursMonth: number | null;
  tasksClosedWeek: number;
}

export interface GoalPeriodKey {
  year: number;
  month: number;
  week: number | null;
}

export interface HitCheck {
  goalId: string;
  period: GoalPeriodKey;
}

/**
 * Puro: dado o contexto de métricas e as metas ativas,
 * retorna quais metas foram cumpridas AGORA.
 * O caller verifica idempotência em GoalHit antes de creditar.
 */
export function evaluateGoals(
  goals: readonly GoalLike[],
  metrics: GoalMetricsCtx,
): readonly GoalLike[] {
  return goals.filter((g) => {
    if (!g.active) return false;
    switch (g.kind) {
      case "POINTS":
        return metrics.pontosMes >= g.target;
      case "TASKS_CLOSED":
        return (g.period === "WEEK" ? metrics.tasksClosedWeek : metrics.tasksClosedMonth) >= g.target;
      case "SLA":
        return metrics.slaMedioMes >= g.target;
      case "AVG_RESOLUTION":
        return (
          metrics.avgResolutionHoursMonth != null &&
          metrics.avgResolutionHoursMonth <= g.target
        );
      case "CUSTOM":
        // CUSTOM fica a cargo de comparação manual/admin (v2). Nunca auto-desbloqueia.
        return false;
      default:
        return false;
    }
  });
}
