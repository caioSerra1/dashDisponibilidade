import { prisma } from "./db";
import { loadConfig } from "./config";
import {
  getPointsForUser,
  getTasksForUser,
  getTimeInStatus,
  findExecutionStartMs,
} from "./clickup";
import { getAvailability, listHosts } from "./zabbix";
import { computePartial } from "./calculate";
import { computeTaskMetrics, type RichTask } from "./metrics";
import { evaluateGoals } from "./goals";
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

  const startByTaskId = new Map<string, number | null>();
  closed.forEach((t, i) => {
    const tis = tisResults[i]!;
    if (!tis.ok) {
      startByTaskId.set(t.id, null);
      return;
    }
    const start = findExecutionStartMs(tis.history, tis.current, executionStatuses);
    startByTaskId.set(t.id, start);
  });

  return tasks.map((t) => {
    if (t.dateClosed == null) return t;
    const start = startByTaskId.get(t.id);
    return { ...t, dateStarted: start ?? null };
  });
}

export interface HostBreakdownItem {
  hostId: string;
  name: string;
  pct: number;
}

async function computeSlaMedio(
  year: number,
  month: number,
  until: Date,
): Promise<{ media: number; breakdown: HostBreakdownItem[] }> {
  const enabledHosts = await prisma.zabbixHost.findMany({ where: { enabled: true } });
  if (enabledHosts.length === 0) return { media: 100, breakdown: [] };
  const { from } = monthRange(year, month);
  try {
    const results = await getAvailability(
      enabledHosts.map((h) => h.hostId),
      from,
      until,
    );
    const byId = new Map(results.map((r) => [r.hostId, r.pct]));
    const breakdown: HostBreakdownItem[] = enabledHosts.map((h) => ({
      hostId: h.hostId,
      name: h.name,
      pct: byId.get(h.hostId) ?? 100,
    }));
    const media =
      breakdown.length === 0
        ? 100
        : breakdown.reduce((acc, r) => acc + r.pct, 0) / breakdown.length;
    return { media, breakdown };
  } catch (e) {
    console.error("[zabbix] getAvailability falhou, assumindo 100", e);
    return {
      media: 100,
      breakdown: enabledHosts.map((h) => ({ hostId: h.hostId, name: h.name, pct: 100 })),
    };
  }
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
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
    const { media: slaMedio, breakdown } = await computeSlaMedio(year, month, now);

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
        console.error("[clickup] getTasksForUser falhou", e);
      }

      // Decora cada task fechada com o real `dateStarted` derivado do
      // ClickApp Time-in-Status (quando entrou em "em execução").
      // Isso faz com que o cycle time seja calculado corretamente.
      tasks = await decorateWithExecutionStart(tasks, config.executionStatuses);

      const metrics = computeTaskMetrics(tasks, now.getTime());
      const pontos = metrics.pointsSum;

      // 2. Calcular variável
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

      // 4. Persistir TaskMetricSnapshot
      await prisma.taskMetricSnapshot.upsert({
        where: { userId_date: { userId: user.id, date: today } },
        update: {
          year,
          month,
          tasksClosedMonth: metrics.tasksClosed,
          tasksClosedWeek: metrics.tasksClosedLast7d,
          pointsMonth: metrics.pointsSum,
          avgResolutionHoursMonth: metrics.avgResolutionHours,
          avgCycleHoursMonth: metrics.avgCycleHours,
          throughputPerWeek: metrics.throughputPerWeek,
          tagsBreakdown: metrics.tagsBreakdown as unknown as object,
          priorityBreakdown: metrics.priorityBreakdown as unknown as object,
        },
        create: {
          userId: user.id,
          date: today,
          year,
          month,
          tasksClosedMonth: metrics.tasksClosed,
          tasksClosedWeek: metrics.tasksClosedLast7d,
          pointsMonth: metrics.pointsSum,
          avgResolutionHoursMonth: metrics.avgResolutionHours,
          avgCycleHoursMonth: metrics.avgCycleHours,
          throughputPerWeek: metrics.throughputPerWeek,
          tagsBreakdown: metrics.tagsBreakdown as unknown as object,
          priorityBreakdown: metrics.priorityBreakdown as unknown as object,
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
      data: { finishedAt: new Date(), message: `processed=${processed}` },
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
    where: { userId, active: true, endedAt: null },
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

export async function runClose(target?: { year: number; month: number }): Promise<{ closed: number }> {
  const run = await prisma.jobRun.create({ data: { job: "close", status: "ok" } });
  try {
    const ref = target ?? previousMonth();
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
      if (existing) continue;

      let tasks: RichTask[] = [];
      try {
        tasks = await getTasksForUser(user.clickupUserId, from, to);
      } catch {
        // ignore
      }
      tasks = await decorateWithExecutionStart(tasks, config.executionStatuses);
      const metrics = computeTaskMetrics(tasks, to.getTime());
      const pontos = metrics.pointsSum;

      const result = computePartial({
        pontosMes: pontos,
        slaMedioMes: slaMedio,
        valorPorPonto: config.valorPorPonto,
        valorDisponibilidade100: config.valorDisponibilidade100,
        tiers,
      });
      await prisma.monthlyClose.create({
        data: {
          userId: user.id,
          year: ref.year,
          month: ref.month,
          pontos,
          slaFinal: slaMedio,
          valorPontos: result.valorPontos,
          valorDisponibilidade: result.valorDisponibilidade,
          valorTotal: result.valorParcial,
        },
      });
      closed += 1;
    }

    await prisma.jobRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), message: `closed=${closed}` },
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
