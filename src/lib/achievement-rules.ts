/**
 * Interpretador declarativo de regras de conquista.
 * Cada Achievement.rule tem shape: { type, value? }
 * O admin cadastra pela UI escolhendo o type; o cálculo é puro e testável.
 */

import type { TaskMetrics } from "./metrics";

export interface AchievementContext {
  slaFinal: number;
  pontosMes: number;
  hasClosedBefore: boolean;
  goalHitsInMonth: number;
  metrics: Pick<TaskMetrics, "avgCycleHours" | "avgResolutionHours" | "tasksClosed"> | null;
}

export type AchievementRule =
  | { type: "SLA_MIN"; value: number }
  | { type: "POINTS_MIN_MONTH"; value: number }
  | { type: "FIRST_MONTH_CLOSED" }
  | { type: "GOAL_HITS_IN_MONTH"; value: number }
  | { type: "CYCLE_HOURS_MAX"; value: number }
  | { type: "RESOLUTION_HOURS_MAX"; value: number }
  | { type: "TASKS_CLOSED_MIN_MONTH"; value: number };

export const RULE_TYPES: readonly AchievementRule["type"][] = [
  "SLA_MIN",
  "POINTS_MIN_MONTH",
  "FIRST_MONTH_CLOSED",
  "GOAL_HITS_IN_MONTH",
  "CYCLE_HOURS_MAX",
  "RESOLUTION_HOURS_MAX",
  "TASKS_CLOSED_MIN_MONTH",
];

export const RULE_LABELS: Record<AchievementRule["type"], string> = {
  SLA_MIN: "Disponibilidade ≥ X%",
  POINTS_MIN_MONTH: "Pontos no mês ≥ X",
  FIRST_MONTH_CLOSED: "Fechou o primeiro mês",
  GOAL_HITS_IN_MONTH: "Bateu X metas no mesmo mês",
  CYCLE_HOURS_MAX: "Cycle time médio ≤ X horas",
  RESOLUTION_HOURS_MAX: "Tempo médio de resolução ≤ X horas",
  TASKS_CLOSED_MIN_MONTH: "Tasks concluídas no mês ≥ X",
};

export function evaluateRule(rule: AchievementRule, ctx: AchievementContext): boolean {
  switch (rule.type) {
    case "SLA_MIN":
      return ctx.slaFinal >= rule.value;
    case "POINTS_MIN_MONTH":
      return ctx.pontosMes >= rule.value;
    case "FIRST_MONTH_CLOSED":
      return !ctx.hasClosedBefore;
    case "GOAL_HITS_IN_MONTH":
      return ctx.goalHitsInMonth >= rule.value;
    case "CYCLE_HOURS_MAX":
      return ctx.metrics?.avgCycleHours != null && ctx.metrics.avgCycleHours <= rule.value;
    case "RESOLUTION_HOURS_MAX":
      return (
        ctx.metrics?.avgResolutionHours != null &&
        ctx.metrics.avgResolutionHours <= rule.value
      );
    case "TASKS_CLOSED_MIN_MONTH":
      return ctx.metrics != null && ctx.metrics.tasksClosed >= rule.value;
    default:
      return false;
  }
}

export interface AchievementLike {
  id: string;
  code: string;
  rule: AchievementRule | null;
}

export function evaluateAchievementsRules(
  achievements: readonly AchievementLike[],
  ctx: AchievementContext,
  alreadyUnlocked: ReadonlySet<string>,
): AchievementLike[] {
  return achievements.filter((a) => {
    if (alreadyUnlocked.has(a.code)) return false;
    if (!a.rule) return false;
    return evaluateRule(a.rule, ctx);
  });
}
