import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parsePeriodFromSearchParams } from "@/lib/date";
import {
  computeBacklogAging,
  computeHeatmap,
  computeTeamEquity,
  computeEvolution,
  detectAnomaly,
  type BacklogAging,
} from "@/lib/team-metrics";
import { getTasksForUser, getAllAssignedTasks } from "@/lib/clickup";
import { loadConfig } from "@/lib/config";
import { normalizeStatusName } from "@/lib/clickup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const periodo = parsePeriodFromSearchParams(url.searchParams);
  const { from, to } = periodo;

  // Período anterior (mesma duração) pra destaque de evolução
  const duration = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(from.getTime() - duration);

  const config = await loadConfig();

  const users = await prisma.user.findMany({
    where: { active: true, showInMural: true, clickupUserId: { not: null } },
    select: { id: true, name: true, email: true, clickupUserId: true },
  });

  const memberResults = await Promise.all(
    users.map(async (u) => {
      const [
        snapshotsInPeriod,
        latestMetric,
        goalHitsCurrent,
        goalHitsPrev,
        prevSnapshots,
        notesCount,
        assigned,
      ] = await Promise.all([
        prisma.dailySnapshot.findMany({
          where: { userId: u.id, date: { gte: from, lte: to } },
          orderBy: { date: "asc" },
        }),
        prisma.taskMetricSnapshot.findFirst({
          where: { userId: u.id, date: { gte: from, lte: to } },
          orderBy: { date: "desc" },
        }),
        prisma.goalHit.findMany({
          where: {
            goal: { userId: u.id },
            hitAt: { gte: from, lte: to },
          },
          include: { goal: { select: { category: true } } },
        }),
        prisma.goalHit.findMany({
          where: {
            goal: { userId: u.id },
            hitAt: { gte: prevFrom, lte: prevTo },
          },
        }),
        prisma.dailySnapshot.findMany({
          where: { userId: u.id, date: { gte: prevFrom, lte: prevTo } },
          orderBy: { date: "desc" },
          take: 30,
        }),
        prisma.userNote.count({ where: { userId: u.id } }),
        // Tasks atribuídas (pra WIP e backlog aging). Ignora falha da API.
        u.clickupUserId
          ? getAllAssignedTasks(u.clickupUserId, from, to).catch(() => null)
          : Promise.resolve(null),
      ]);

      const latestSnap = snapshotsInPeriod.at(-1);

      // Métricas do período (dev)
      const pontosDev = latestMetric?.pointsMonthDev ?? 0;
      const tasksDev = latestMetric?.tasksClosedMonthDev ?? 0;
      const tasksSuporte = latestMetric?.tasksClosedMonthSupport ?? 0;
      const slaAvg = latestSnap?.slaMedioMes ?? 0;
      const mttrHoras = latestMetric?.avgResolutionHoursDev ?? null;
      const mttaHoras = latestMetric?.avgAckHoursSupport ?? null;
      const retornosExecucao = latestMetric?.returnedCountMonth ?? 0;

      // WIP e backlog a partir das tasks ainda abertas
      let wipAtual = 0;
      let backlogAging: BacklogAging = {
        "0-2d": 0,
        "3-7d": 0,
        "8-14d": 0,
        "15-30d": 0,
        ">30d": 0,
      };
      if (assigned) {
        const executionNormalized = new Set(
          config.executionStatuses.map(normalizeStatusName),
        );
        wipAtual = assigned.pending.filter((t) =>
          t.status ? executionNormalized.has(normalizeStatusName(t.status)) : false,
        ).length;
        backlogAging = computeBacklogAging(
          assigned.pending.map((t) => ({
            dateCreated: t.dateCreated,
            dateClosed: null,
          })),
        );
      }

      // Metas e marcos batidos no período
      const metasBatidas = goalHitsCurrent.filter(
        (h) => h.goal.category === "METRIC",
      ).length;
      const marcosBatidos = goalHitsCurrent.filter(
        (h) => h.goal.category === "MILESTONE",
      ).length;

      // Evolução vs período anterior
      const prevLatestMetric = await prisma.taskMetricSnapshot.findFirst({
        where: { userId: u.id, date: { gte: prevFrom, lte: prevTo } },
        orderBy: { date: "desc" },
      });
      const prevLatestSnap = prevSnapshots.at(0);
      const evolution = computeEvolution(
        {
          pontosDev,
          tasksDev,
          slaAvg,
          avgResolutionHours: mttrHoras,
        },
        {
          pontosDev: prevLatestMetric?.pointsMonthDev ?? 0,
          tasksDev: prevLatestMetric?.tasksClosedMonthDev ?? 0,
          slaAvg: prevLatestSnap?.slaMedioMes ?? 0,
          avgResolutionHours: prevLatestMetric?.avgResolutionHoursDev ?? null,
        },
      );

      // Anomalia: série diária de pontos do usuário (período atual)
      const serie = snapshotsInPeriod.map((s) => s.pontosAcumulados);
      const alertaAnomalia = detectAnomaly(serie);

      return {
        u,
        card: {
          userId: u.id,
          name: u.name,
          pontosDev,
          tasksDev,
          tasksSuporte,
          slaAvg,
          mttrHoras,
          mttaHoras,
          wipAtual,
          backlogAging,
          retornosExecucao,
          metasBatidas,
          marcosBatidos,
          alertaAnomalia,
          temAnotacaoPrivada: notesCount > 0,
          scoreEvolucao: evolution.scoreEvolucao,
          deltaEvolucao: evolution.delta,
          prevGoalHitsCount: goalHitsPrev.length,
        },
      };
    }),
  );

  // Agrega KPIs da equipe
  const allCards = memberResults.map((m) => m.card);
  const totalPontosDev = allCards.reduce((a, c) => a + c.pontosDev, 0);
  const totalTasksDev = allCards.reduce((a, c) => a + c.tasksDev, 0);
  const totalTasksSuporte = allCards.reduce((a, c) => a + c.tasksSuporte, 0);
  const wipAtualTotal = allCards.reduce((a, c) => a + c.wipAtual, 0);
  const retornosTotal = allCards.reduce((a, c) => a + c.retornosExecucao, 0);
  const backlogAgingTotal: BacklogAging = {
    "0-2d": 0,
    "3-7d": 0,
    "8-14d": 0,
    "15-30d": 0,
    ">30d": 0,
  };
  for (const c of allCards) {
    for (const k of Object.keys(backlogAgingTotal) as Array<keyof BacklogAging>) {
      backlogAgingTotal[k] += c.backlogAging[k];
    }
  }

  const slaWithData = allCards.filter((c) => c.slaAvg > 0).map((c) => c.slaAvg);
  const slaMedio =
    slaWithData.length > 0
      ? slaWithData.reduce((a, b) => a + b, 0) / slaWithData.length
      : 0;

  const mttrValues = allCards
    .map((c) => c.mttrHoras)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const mttrMedio =
    mttrValues.length > 0
      ? Math.round((mttrValues.reduce((a, b) => a + b, 0) / mttrValues.length) * 10) / 10
      : null;

  const mttaValues = allCards
    .map((c) => c.mttaHoras)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const mttaMedio =
    mttaValues.length > 0
      ? Math.round((mttaValues.reduce((a, b) => a + b, 0) / mttaValues.length) * 10) / 10
      : null;

  const throughputPorSemana = (() => {
    const days = Math.max(
      1,
      Math.ceil((to.getTime() - from.getTime()) / (24 * 3600_000)),
    );
    const weeks = Math.max(1, days / 7);
    return Math.round((totalTasksDev / weeks) * 10) / 10;
  })();

  const equidade = computeTeamEquity(allCards.map((c) => c.pontosDev));

  // Heatmap: precisa de todas as tasks fechadas no período. Agregamos o que
  // já vem do ClickUp em `getAllAssignedTasks`.
  const allClosedDates: Array<{ dateClosed: number | null }> = [];
  for (const m of memberResults) {
    if (!m.u.clickupUserId) continue;
    try {
      const raw = await getTasksForUser(m.u.clickupUserId, from, to);
      for (const t of raw) {
        if (t.dateClosed != null) allClosedDates.push({ dateClosed: t.dateClosed });
      }
    } catch {
      // ignora falha por usuário
    }
  }
  const heatmap = computeHeatmap(allClosedDates);

  // Destaque de evolução — quem tem maior scoreEvolucao (positivo)
  const destaqueCard =
    allCards
      .filter((c) => c.scoreEvolucao > 0)
      .sort((a, b) => b.scoreEvolucao - a.scoreEvolucao)[0] ?? null;

  // Ordena cards por pontosDev (ranking)
  allCards.sort((a, b) => b.pontosDev - a.pontosDev);

  return NextResponse.json({
    periodo: {
      modo: periodo.mode,
      de: from.toISOString(),
      ate: to.toISOString(),
      label: periodo.label,
    },
    kpisEquipe: {
      pontosDev: totalPontosDev,
      tasksDev: totalTasksDev,
      tasksSuporte: totalTasksSuporte,
      slaMedio: Math.round(slaMedio * 100) / 100,
      mttrMedio,
      mttaMedio,
      wipAtual: wipAtualTotal,
      throughputPorSemana,
      retornosExecucao: retornosTotal,
      equidade,
      backlogAging: backlogAgingTotal,
    },
    destaqueEvolucao: destaqueCard
      ? {
          userId: destaqueCard.userId,
          name: destaqueCard.name,
          scoreEvolucao: destaqueCard.scoreEvolucao,
          delta: destaqueCard.deltaEvolucao,
        }
      : null,
    membros: allCards,
    heatmap,
  });
}
