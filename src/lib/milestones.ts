/**
 * Evaluator de metas categoria MILESTONE (marcos).
 *
 * Absorveu os tipos de regra que viviam no antigo `achievement-rules.ts`.
 * Uma meta MILESTONE guarda em `Goal.rule` um objeto JSON declarativo no
 * formato `{ type, value? }` — este módulo converte esse JSON em
 * verificações contra o contexto do usuário no momento do fechamento.
 */

export type MilestoneRule =
  | { type: "SLA_MIN"; value: number }
  | { type: "POINTS_MIN_MONTH"; value: number }
  | { type: "FIRST_MONTH_CLOSED" }
  | { type: "GOAL_HITS_IN_MONTH"; value: number }
  | { type: "CYCLE_HOURS_MAX"; value: number }
  | { type: "RESOLUTION_HOURS_MAX"; value: number }
  | { type: "TASKS_CLOSED_MIN_MONTH"; value: number };

export interface MilestoneContext {
  slaFinal: number;
  pontosMes: number;
  hasClosedBefore: boolean;
  goalHitsInMonth: number;
  metrics: {
    avgCycleHours: number | null;
    avgResolutionHours: number | null;
    tasksClosed: number;
  } | null;
}

export interface MilestoneLike {
  id: string;
  rule: MilestoneRule | null;
}

/**
 * Retorna true se a regra bate o contexto. Regras com métricas nulas
 * (avgCycleHours/avgResolutionHours) falham silenciosamente.
 */
export function evaluateRule(rule: MilestoneRule, ctx: MilestoneContext): boolean {
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
      return (
        ctx.metrics != null &&
        ctx.metrics.avgCycleHours != null &&
        ctx.metrics.avgCycleHours <= rule.value
      );
    case "RESOLUTION_HOURS_MAX":
      return (
        ctx.metrics != null &&
        ctx.metrics.avgResolutionHours != null &&
        ctx.metrics.avgResolutionHours <= rule.value
      );
    case "TASKS_CLOSED_MIN_MONTH":
      return ctx.metrics != null && ctx.metrics.tasksClosed >= rule.value;
    default:
      return false;
  }
}

/**
 * Avaliação pura: recebe milestones candidatos + contexto, devolve os que
 * batem. O caller é responsável pela idempotência (GoalHit) e pelo crédito.
 */
export function evaluateMilestones(
  milestones: readonly MilestoneLike[],
  ctx: MilestoneContext,
): readonly MilestoneLike[] {
  return milestones.filter((m) => m.rule != null && evaluateRule(m.rule, ctx));
}
