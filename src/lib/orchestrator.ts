import { prisma } from "./db";
import { loadConfig } from "./config";
import {
  getPointsForUser,
  getTasksForUser,
  getTimeInStatus,
  findExecutionStartMs,
  countReturnsToExecution,
  computeExecutionMinutes,
} from "./clickup";
import { getAvailability, listHosts, listProblemsForHosts } from "./zabbix";
import { getWebAppSla, getServerSla } from "./web-monitor";
import { computePartial } from "./calculate";
import { computeTaskMetrics, type RichTask, type TaskMetrics } from "./metrics";
import { evaluateGoals } from "./goals";
import { evaluateMilestones, type MilestoneContext, type MilestoneRule } from "./milestones";
import { credit } from "./wallet";
import { monthRange, currentMonth } from "./date";

async function loadTiers() {
  const tiers = await prisma.slaTier.findMany({ orderBy: { minPct: "desc" } });
  return tiers.map((t) => ({ minPct: t.minPct, payoutPct: t.payoutPct }));
}

/**
 * Para cada task fechada, busca o tempo em status no ClickUp e descobre
 * quando ela entrou em "em execução" pela primeira vez. Sobrescreve o
 * `dateStarted` da task para que o `computeTaskMetrics` calcule cycle time
 * a partir desse marco.
 *
 * Se uma task NÃO passou por nenhum status de execução, seu `dateStarted`
 * fica null — `computeTaskMetrics` exclui essas tasks da média de cycle.
 *
 * Tasks sem `dateClosed` (ainda abertas) não são tocadas.
 */
async function decorateWithExecutionStart(
  tasks: RichTask[],
  executionStatuses: readonly string[],
): Promise<RichTask[]> {
  if (tasks.length === 0 || executionStatuses.length === 0) return tasks;

  const closed = tasks.filter((t) => t.dateClosed != null);
  if (closed.length === 0) return tasks;

  const tisResults = await Promise.all(
    closed.map((t) =>
      getTimeInStatus(t.id).catch(() => ({
        ok: false as const,
        history: [],
        current: null,
      })),
    ),
  );

  const decoratedById = new Map<string, {
    start: number | null;
    returns: number;
    execMinutes: number | null;
  }>();
  closed.forEach((t, i) => {
    const tis = tisResults[i]!;
    if (!tis.ok) {
      decoratedById.set(t.id, { start: null, returns: 0, execMinutes: null });
      return;
    }
    const start = findExecutionStartMs(tis.history, tis.current, executionStatuses);
    const returns = countReturnsToExecution(tis.history, tis.current, executionStatuses);
    const execMinutes = computeExecutionMinutes(tis.history, tis.current, executionStatuses);
    decoratedById.set(t.id, { start, returns, execMinutes });
  });

  return tasks.map((t) => {
    if (t.dateClosed == null) return t;
    const decorated = decoratedById.get(t.id);
    if (!decorated) return t;
    return {
      ...t,
      dateStarted: decorated.start ?? null,
      returnedToExecution: decorated.returns,
      executionMinutes: decorated.execMinutes,
    };
  });
}

export interface HostBreakdownItem {
  hostId: string;
  name: string;
  /**
   * `null` = sem dados suficientes pra medir (host recém-cadastrado,
   * sem item de ping, RPC falhou). Esses são EXCLUÍDOS da média —
   * nunca preenchemos com 100% fake.
   */
  pct: number | null;
  /** "server" = host Zabbix; "app" = URL monitorada internamente. */
  type?: "server" | "app";
}

/**
 * Wrapper público de computeSlaMedio pra ser usado por endpoints que
 * precisam do SLA da equipe num período. Sempre lê AO VIVO (não cacheia
 * em snapshot) — garante que mudanças de tier/config/host sejam refletidas
 * imediatamente em todas as telas.
 */
export async function getTeamSlaForPeriod(
  year: number,
  month: number,
  until: Date,
): Promise<{ media: number; breakdown: HostBreakdownItem[] }> {
  return computeSlaMedio(year, month, until);
}

async function computeSlaMedio(
  year: number,
  month: number,
  until: Date,
): Promise<{ media: number; breakdown: HostBreakdownItem[] }> {
  const { from } = monthRange(year, month);

  const [enabledHosts, enabledApps] = await Promise.all([
    prisma.zabbixHost.findMany({ where: { enabled: true } }),
    prisma.webApp.findMany({ where: { enabled: true }, select: { id: true, name: true } }),
  ]);

  // Sem nenhum target habilitado: usa 100% como neutro (admin optou por não
  // medir disponibilidade). Não é "fake" — é configuração explícita.
  if (enabledHosts.length === 0 && enabledApps.length === 0) {
    return { media: 100, breakdown: [] };
  }

  // Servidores: SLA lido DIRETAMENTE do dashboard "Disponibilidade" do
  // Zabbix em runtime via avg do history.get no período.
  //
  // Passamos availabilityItemId como override por host quando o admin
  // configurou manualmente — garante que usamos EXATAMENTE o mesmo item
  // que o widget do dashboard nativo usa (sem ambiguidade de pattern).
  let serverBreakdown: HostBreakdownItem[] = [];
  if (enabledHosts.length > 0) {
    try {
      const itemOverrides: Record<string, string | null> = {};
      for (const h of enabledHosts) {
        if (h.availabilityItemId) itemOverrides[h.hostId] = h.availabilityItemId;
      }
      const zabbixResults = await getAvailability(
        enabledHosts.map((h) => h.hostId),
        from,
        until,
        itemOverrides,
      );
      const byId = new Map(zabbixResults.map((r) => [r.hostId, r.pct]));
      serverBreakdown = enabledHosts.map((h) => ({
        hostId: h.hostId,
        name: h.name,
        pct: byId.get(h.hostId) ?? null,
        type: "server" as const,
      }));
    } catch (e) {
      console.error("[orchestrator] getAvailability falhou", (e as Error).message);
      // Fallback: usa espelho local (ServerEvent) — degrada mas não quebra.
      serverBreakdown = await Promise.all(
        enabledHosts.map(async (h) => ({
          hostId: h.hostId,
          name: h.name,
          pct: await getServerSla(h.hostId, from, until),
          type: "server" as const,
        })),
      );
    }
  }

  // Aplicações monitoradas internamente: SLA via WebAppEvent
  const appBreakdown: HostBreakdownItem[] = await Promise.all(
    enabledApps.map(async (app) => ({
      hostId: app.id,
      name: app.name,
      pct: await getWebAppSla(app.id, from, until),
      type: "app" as const,
    })),
  );

  const breakdown = [...serverBreakdown, ...appBreakdown];
  // Exclui targets sem dados (pct=null) da média. Documentado explicitamente:
  // não inflamos SLA preenchendo lacuna com 100%.
  const measurable = breakdown.filter(
    (b): b is HostBreakdownItem & { pct: number } => b.pct != null,
  );
  const media =
    measurable.length === 0
      ? 100
      : measurable.reduce((acc, r) => acc + r.pct, 0) / measurable.length;
  return { media, breakdown };
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Espelha problemas do Zabbix dos hosts habilitados pra `ServerEvent` local.
 * Idempotente via unique(hostId, zabbixEventId) — re-rodar não duplica.
 *
 * Cobre o período [from, until). Pega problemas que abriram dentro do
 * período OU continuam abertos. Atualiza endedAt quando o problema resolve
 * no Zabbix.
 */
async function mirrorZabbixProblems(
  from: Date,
  until: Date,
): Promise<{ created: number; updated: number }> {
  const enabledHosts = await prisma.zabbixHost.findMany({
    where: { enabled: true },
    select: { hostId: true },
  });
  if (enabledHosts.length === 0) return { created: 0, updated: 0 };

  const problems = await listProblemsForHosts(
    enabledHosts.map((h) => h.hostId),
    from,
    until,
  );

  let created = 0;
  let updated = 0;
  for (const p of problems) {
    const existing = await prisma.serverEvent.findUnique({
      where: { hostId_zabbixEventId: { hostId: p.hostId, zabbixEventId: p.zabbixEventId } },
    });
    if (existing) {
      // Atualiza apenas se endedAt mudou (problema foi resolvido).
      if (existing.endedAt?.getTime() !== p.endedAt?.getTime()) {
        await prisma.serverEvent.update({
          where: { id: existing.id },
          data: { endedAt: p.endedAt },
        });
        updated += 1;
      }
    } else {
      await prisma.serverEvent.create({
        data: {
          hostId: p.hostId,
          zabbixEventId: p.zabbixEventId,
          kind: "down",
          startedAt: p.startedAt,
          endedAt: p.endedAt,
          severity: p.severity,
          triggerName: p.triggerName,
          itemKey: p.itemKey,
        },
      });
      created += 1;
    }
  }
  return { created, updated };
}

/**
 * Job leve dedicado a Zabbix: busca disponibilidade atual do mês e atualiza
 * o slaMedioMes + valorDisponibilidade no DailySnapshot de HOJE de todos os
 * users ativos. Não toca ClickUp (rápido, ~2s vs ~30s do runDaily).
 *
 * Pensado pra rodar a cada 2h, mais frequente que o runDaily de 30min, sem
 * o custo de buscar tasks de cada user.
 */
export async function runZabbixSync(now: Date = new Date()): Promise<{ updated: number; sla: number }> {
  const run = await prisma.jobRun.create({ data: { job: "zabbix", status: "ok" } });
  try {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const today = startOfUtcDay(now);

    // 1. Mantém inventário sincronizado pra refletir hosts novos/removidos no Zabbix.
    try {
      await syncZabbixHosts();
    } catch (e) {
      console.error("[zabbix-sync] syncZabbixHosts falhou", (e as Error).message);
    }

    // 2. Espelha problemas do Zabbix (eventos PROBLEM/OK das triggers de
    //    ping) em ServerEvent local. Garante histórico auditável e cálculo
    //    de SLA independente do Zabbix em runtime.
    //    Janela ampla (90 dias) pra capturar problemas que abriram antes do
    //    período corrente mas continuam abertos.
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
    const mirror = await mirrorZabbixProblems(ninetyDaysAgo, now);

    // 3. Busca disponibilidade do mês a partir do DB local (ServerEvent).
    const config = await loadConfig();
    const tiers = await loadTiers();
    const { media: slaMedio, breakdown } = await computeSlaMedio(year, month, now);

    // 3. Atualiza DailySnapshot de hoje pra cada user (recalcula valorDisponibilidade
    //    com o SLA novo, mantendo pontosAcumulados/valorPontos do último runDaily).
    const todaySnapshots = await prisma.dailySnapshot.findMany({
      where: { date: today },
    });

    let updated = 0;
    for (const snap of todaySnapshots) {
      const result = computePartial({
        pontosMes: snap.pontosAcumulados,
        slaMedioMes: slaMedio,
        valorPorPonto: config.valorPorPonto,
        valorDisponibilidade100: config.valorDisponibilidade100,
        tiers,
      });
      await prisma.dailySnapshot.update({
        where: { id: snap.id },
        data: {
          slaMedioMes: slaMedio,
          valorDisponibilidade: result.valorDisponibilidade,
          valorParcial: result.valorParcial,
          hostBreakdown: breakdown as unknown as object,
        },
      });
      updated += 1;
    }

    await prisma.jobRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        message: `sla=${slaMedio.toFixed(2)}% updated=${updated} mirror=${mirror.created}+${mirror.updated}`,
      },
    });
    return { updated, sla: slaMedio };
  } catch (e) {
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), status: "error", message: (e as Error).message },
    });
    throw e;
  }
}

export async function runDaily(now: Date = new Date()): Promise<{ processed: number }> {
  const run = await prisma.jobRun.create({ data: { job: "daily", status: "ok" } });
  try {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const today = startOfUtcDay(now);
    const { from, to } = monthRange(year, month);

    const config = await loadConfig();
    const tiers = await loadTiers();

    // Zabbix erra -> JobRun fica como error (sem fallback fake de 100% nem
    // "ultimo SLA"). Melhor o run aparecer vermelho no admin/jobs do que
    // silenciosamente persistir um numero que nao reflete a realidade.
    const { media: slaMedio, breakdown } = await computeSlaMedio(year, month, now);

    // Sincroniza inventário de hosts pra manter lastSync atualizado
    try {
      await syncZabbixHosts();
    } catch (e) {
      console.error("[daily] syncZabbixHosts falhou", (e as Error).message);
    }

    const users = await prisma.user.findMany({
      where: { active: true, clickupUserId: { not: null } },
    });

    let processed = 0;
    for (const user of users) {
      if (!user.clickupUserId) continue;

      // 1. Buscar tasks ricas do mês para métricas + pontos
      let tasks: RichTask[] = [];
      try {
        tasks = await getTasksForUser(user.clickupUserId, from, now);
      } catch (e) {
        console.error(`[daily] ClickUp falhou pra ${user.name}, pulando`, e);
        continue;
      }

      // Decora cada task fechada com o real `dateStarted` derivado do
      // ClickApp Time-in-Status (quando entrou em "em execução").
      // Isso faz com que o cycle time seja calculado corretamente.
      tasks = await decorateWithExecutionStart(tasks, config.executionStatuses);

      const metrics = computeTaskMetrics(tasks, now.getTime(), config.taskClassification, config.maxExecDays);
      const pontos = metrics.pointsSum;

      // 2. Calcular variável (pontos = só DEV, suporte não pontua)
      const result = computePartial({
        pontosMes: pontos,
        slaMedioMes: slaMedio,
        valorPorPonto: config.valorPorPonto,
        valorDisponibilidade100: config.valorDisponibilidade100,
        tiers,
      });

      // 3. Persistir DailySnapshot
      await prisma.dailySnapshot.upsert({
        where: { userId_date: { userId: user.id, date: today } },
        update: {
          pontosAcumulados: result.pontosMes,
          slaMedioMes: result.slaMedioMes,
          valorPontos: result.valorPontos,
          valorDisponibilidade: result.valorDisponibilidade,
          valorParcial: result.valorParcial,
          hostBreakdown: breakdown as unknown as object,
        },
        create: {
          userId: user.id,
          date: today,
          pontosAcumulados: result.pontosMes,
          slaMedioMes: result.slaMedioMes,
          valorPontos: result.valorPontos,
          valorDisponibilidade: result.valorDisponibilidade,
          valorParcial: result.valorParcial,
          hostBreakdown: breakdown as unknown as object,
        },
      });

      // 4. Persistir TaskMetricSnapshot (totais + segmentado dev/suporte)
      const snapshotData = {
        year,
        month,
        // Totais (dev + suporte)
        tasksClosedMonth: metrics.tasksClosed,
        tasksClosedWeek: metrics.tasksClosedLast7d,
        pointsMonth: metrics.pointsSum,
        avgResolutionHoursMonth: metrics.avgResolutionHours,
        avgCycleHoursMonth: metrics.avgCycleHours,
        throughputPerWeek: metrics.throughputPerWeek,
        reopenedCount: metrics.returnedToExecution,
        tagsBreakdown: metrics.tagsBreakdown as unknown as object,
        priorityBreakdown: metrics.priorityBreakdown as unknown as object,
        // Segmentado
        tasksClosedMonthDev: metrics.byType.dev.tasksClosed,
        tasksClosedMonthSupport: metrics.byType.support.tasksClosed,
        pointsMonthDev: metrics.byType.dev.pointsSum,
        avgResolutionHoursDev: metrics.byType.dev.avgResolutionHours,
        avgResolutionHoursSupport: metrics.byType.support.avgResolutionHours,
        avgCycleHoursDev: metrics.byType.dev.avgCycleHours,
        avgCycleHoursSupport: metrics.byType.support.avgCycleHours,
        avgAckHoursSupport: metrics.byType.support.avgAckHours,
        returnedCountMonth: metrics.returnedToExecution,
        typeBreakdown: metrics.byType as unknown as object,
      };
      await prisma.taskMetricSnapshot.upsert({
        where: { userId_date: { userId: user.id, date: today } },
        update: snapshotData,
        create: {
          userId: user.id,
          date: today,
          ...snapshotData,
        },
      });

      // 5. Avaliar metas → creditar moedas (idempotente via GoalHit)
      await maybeCreditGoals(user.id, year, month, {
        pontosMes: pontos,
        tasksClosedMonth: metrics.tasksClosed,
        slaMedioMes: slaMedio,
        avgResolutionHoursMonth: metrics.avgResolutionHours,
        tasksClosedWeek: metrics.tasksClosedLast7d,
      });

      processed += 1;
    }

    await prisma.jobRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        message: `processed=${processed}`,
      },
    });
    return { processed };
  } catch (e) {
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), status: "error", message: (e as Error).message },
    });
    throw e;
  }
}

async function maybeCreditGoals(
  userId: string,
  year: number,
  month: number,
  metricsCtx: {
    pontosMes: number;
    tasksClosedMonth: number;
    slaMedioMes: number;
    avgResolutionHoursMonth: number | null;
    tasksClosedWeek: number;
  },
) {
  const goals = await prisma.goal.findMany({
    where: { userId, category: "METRIC", active: true, endedAt: null },
  });
  const hits = evaluateGoals(goals, metricsCtx);
  for (const goal of hits) {
    // Idempotência manual: Postgres trata NULL como distinto, então o unique do schema
    // não basta quando week é null. Verificamos explicitamente antes.
    const existing = await prisma.goalHit.findFirst({
      where: { goalId: goal.id, year, month, week: null },
    });
    if (existing) continue;
    await prisma.goalHit.create({
      data: {
        goalId: goal.id,
        year,
        month,
        week: null,
        coinsPaid: goal.coinsReward,
      },
    });
    if (goal.coinsReward > 0) {
      await credit({
        userId,
        amount: goal.coinsReward,
        reason: `goal:${goal.kind}`,
        refType: "goal",
        refId: goal.id,
      });
    }
    // Metas não renováveis encerram após bater uma vez
    if (!goal.renewable) {
      await prisma.goal.update({
        where: { id: goal.id },
        data: { endedAt: new Date() },
      });
    }
  }
}

export interface RunCloseOptions {
  year: number;
  month: number;
  /** Apaga MonthlyClose+TaskMetricSnapshot existentes do mês e refaz tudo. */
  force?: boolean;
}

export async function runClose(target?: RunCloseOptions): Promise<{ closed: number }> {
  const run = await prisma.jobRun.create({ data: { job: "close", status: "ok" } });
  try {
    const ref = target ?? previousMonth();
    const force = target?.force ?? false;
    const { from, to } = monthRange(ref.year, ref.month);
    const config = await loadConfig();
    const tiers = await loadTiers();

    const { media: slaMedio } = await computeSlaMedio(ref.year, ref.month, to);

    const users = await prisma.user.findMany({
      where: { active: true, clickupUserId: { not: null } },
    });

    let closed = 0;
    for (const user of users) {
      if (!user.clickupUserId) continue;
      const existing = await prisma.monthlyClose.findUnique({
        where: { userId_year_month: { userId: user.id, year: ref.year, month: ref.month } },
      });
      if (existing && !force) continue;

      let tasks: RichTask[] = [];
      try {
        tasks = await getTasksForUser(user.clickupUserId, from, to);
      } catch (e) {
        console.error(`[close] ClickUp falhou pra ${user.name}, pulando`, e);
        continue;
      }
      tasks = await decorateWithExecutionStart(tasks, config.executionStatuses);
      const metrics = computeTaskMetrics(tasks, to.getTime(), config.taskClassification, config.maxExecDays);
      const pontos = metrics.pointsSum;

      const result = computePartial({
        pontosMes: pontos,
        slaMedioMes: slaMedio,
        valorPorPonto: config.valorPorPonto,
        valorDisponibilidade100: config.valorDisponibilidade100,
        tiers,
      });

      const closeData = {
        pontos,
        slaFinal: slaMedio,
        valorPontos: result.valorPontos,
        valorDisponibilidade: result.valorDisponibilidade,
        valorTotal: result.valorParcial,
      };

      if (existing && force) {
        await prisma.monthlyClose.update({
          where: { id: existing.id },
          data: closeData,
        });
      } else {
        await prisma.monthlyClose.create({
          data: { userId: user.id, year: ref.year, month: ref.month, ...closeData },
        });
      }

      // Persiste TaskMetricSnapshot do último dia do mês — alimenta MTTR/MTTA
      // e contagens segmentadas no mural pra meses passados (sem isso, fica vazio).
      const snapshotDate = startOfUtcDay(to);
      const metricSnapshotData = {
        year: ref.year,
        month: ref.month,
        tasksClosedMonth: metrics.tasksClosed,
        tasksClosedWeek: metrics.tasksClosedLast7d,
        pointsMonth: metrics.pointsSum,
        avgResolutionHoursMonth: metrics.avgResolutionHours,
        avgCycleHoursMonth: metrics.avgCycleHours,
        throughputPerWeek: metrics.throughputPerWeek,
        reopenedCount: metrics.returnedToExecution,
        tagsBreakdown: metrics.tagsBreakdown as unknown as object,
        priorityBreakdown: metrics.priorityBreakdown as unknown as object,
        tasksClosedMonthDev: metrics.byType.dev.tasksClosed,
        tasksClosedMonthSupport: metrics.byType.support.tasksClosed,
        pointsMonthDev: metrics.byType.dev.pointsSum,
        avgResolutionHoursDev: metrics.byType.dev.avgResolutionHours,
        avgResolutionHoursSupport: metrics.byType.support.avgResolutionHours,
        avgCycleHoursDev: metrics.byType.dev.avgCycleHours,
        avgCycleHoursSupport: metrics.byType.support.avgCycleHours,
        avgAckHoursSupport: metrics.byType.support.avgAckHours,
        returnedCountMonth: metrics.returnedToExecution,
        typeBreakdown: metrics.byType as unknown as object,
      };
      await prisma.taskMetricSnapshot.upsert({
        where: { userId_date: { userId: user.id, date: snapshotDate } },
        update: metricSnapshotData,
        create: { userId: user.id, date: snapshotDate, ...metricSnapshotData },
      });

      await maybeCreditMilestones(user.id, ref.year, ref.month, {
        pontos,
        slaFinal: slaMedio,
        metrics,
      });

      closed += 1;
    }

    await prisma.jobRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        message: `closed=${closed}`,
      },
    });
    return { closed };
  } catch (e) {
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), status: "error", message: (e as Error).message },
    });
    throw e;
  }
}

/**
 * Avalia metas categoria MILESTONE no fechamento mensal e credita quem bateu.
 *
 * Idempotente: verifica GoalHit antes de criar. Metas não renováveis são
 * encerradas (`endedAt`) após a primeira batida.
 */
async function maybeCreditMilestones(
  userId: string,
  year: number,
  month: number,
  ctx: {
    pontos: number;
    slaFinal: number;
    metrics: TaskMetrics;
  },
) {
  const milestones = await prisma.goal.findMany({
    where: { userId, category: "MILESTONE", active: true, endedAt: null },
  });
  if (milestones.length === 0) return;

  const [priorCloses, goalHitsInMonth] = await Promise.all([
    prisma.monthlyClose.count({
      where: { userId, NOT: { year, month } },
    }),
    prisma.goalHit.count({
      where: { goal: { userId, category: "METRIC" }, year, month },
    }),
  ]);

  const evalCtx: MilestoneContext = {
    slaFinal: ctx.slaFinal,
    pontosMes: ctx.pontos,
    hasClosedBefore: priorCloses > 0,
    goalHitsInMonth,
    metrics: {
      avgCycleHours: ctx.metrics.avgCycleHours,
      avgResolutionHours: ctx.metrics.avgResolutionHours,
      tasksClosed: ctx.metrics.tasksClosed,
    },
  };

  const candidates = milestones.map((m) => ({
    id: m.id,
    rule: (m.rule ?? null) as MilestoneRule | null,
  }));
  const hits = evaluateMilestones(candidates, evalCtx);
  const hitIds = new Set(hits.map((h) => h.id));

  for (const goal of milestones) {
    if (!hitIds.has(goal.id)) continue;

    const existing = await prisma.goalHit.findFirst({
      where: { goalId: goal.id, year, month, week: null },
    });
    if (existing) continue;

    await prisma.goalHit.create({
      data: {
        goalId: goal.id,
        year,
        month,
        week: null,
        coinsPaid: goal.coinsReward,
      },
    });
    if (goal.coinsReward > 0) {
      await credit({
        userId,
        amount: goal.coinsReward,
        reason: `milestone:${goal.id}`,
        refType: "milestone",
        refId: goal.id,
      });
    }
    // Marcos não renováveis encerram após bater uma vez — marcos tipicamente
    // são definitivos, mas deixamos o admin controlar via `renewable`.
    if (!goal.renewable) {
      await prisma.goal.update({
        where: { id: goal.id },
        data: { endedAt: new Date() },
      });
    }
  }
}

function previousMonth(): { year: number; month: number } {
  const { year, month } = currentMonth();
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export async function syncZabbixHosts(): Promise<{ imported: number }> {
  const hosts = await listHosts();
  for (const h of hosts) {
    await prisma.zabbixHost.upsert({
      where: { hostId: h.hostId },
      update: { name: h.name, lastSync: new Date() },
      create: { hostId: h.hostId, name: h.name, enabled: false, lastSync: new Date() },
    });
  }
  return { imported: hosts.length };
}

// Mantém compatibilidade com call sites antigos
export { getPointsForUser };
