import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parsePeriodFromSearchParams } from "@/lib/date";
import {
  computeTeamEquity,
  computeEvolution,
  detectAnomaly,
} from "@/lib/team-metrics";

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

  const duration = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(from.getTime() - duration);

  const isFullMonth = periodo.mode === "mes";
  const fallbackYear = from.getUTCFullYear();
  const fallbackMonth = from.getUTCMonth() + 1;

  const users = await prisma.user.findMany({
    where: { active: true, showInMural: true, clickupUserId: { not: null } },
    select: { id: true, name: true, email: true },
  });

  const memberResults = await Promise.all(
    users.map(async (u) => {
      const [
        snapshotsInPeriod,
        latestMetric,
        prevLatestMetric,
        goalHitsCurrent,
        prevSnapshots,
        notesCount,
        monthlyClose,
      ] = await Promise.all([
        prisma.dailySnapshot.findMany({
          where: { userId: u.id, date: { gte: from, lte: to } },
          orderBy: { date: "asc" },
        }),
        prisma.taskMetricSnapshot.findFirst({
          where: { userId: u.id, date: { gte: from, lte: to } },
          orderBy: { date: "desc" },
        }),
        prisma.taskMetricSnapshot.findFirst({
          where: { userId: u.id, date: { gte: prevFrom, lte: prevTo } },
          orderBy: { date: "desc" },
        }),
        prisma.goalHit.findMany({
          where: { goal: { userId: u.id }, hitAt: { gte: from, lte: to } },
          include: { goal: { select: { category: true } } },
        }),
        prisma.dailySnapshot.findMany({
          where: { userId: u.id, date: { gte: prevFrom, lte: prevTo } },
          orderBy: { date: "desc" },
          take: 30,
        }),
        prisma.userNote.count({ where: { userId: u.id } }),
        isFullMonth
          ? prisma.monthlyClose.findUnique({
              where: {
                userId_year_month: {
                  userId: u.id,
                  year: fallbackYear,
                  month: fallbackMonth,
                },
              },
            })
          : Promise.resolve(null),
      ]);

      const latestSnap = snapshotsInPeriod.at(-1);

      // Fallback pra snapshots pré-reforma
      const segmentedTotal =
        (latestMetric?.tasksClosedMonthDev ?? 0) +
        (latestMetric?.tasksClosedMonthSupport ?? 0);
      const hasSegmentedData =
        segmentedTotal > 0 || (latestMetric?.pointsMonthDev ?? 0) > 0;
      const legacyTotalTasks = latestMetric?.tasksClosedMonth ?? 0;
      const usePreReformaFallback = !hasSegmentedData && legacyTotalTasks > 0;

      const pontosDev = usePreReformaFallback
        ? latestMetric?.pointsMonth ?? 0
        : latestMetric?.pointsMonthDev ?? monthlyClose?.pontos ?? 0;
      const tasksDev = usePreReformaFallback
        ? legacyTotalTasks
        : latestMetric?.tasksClosedMonthDev ?? 0;
      const tasksSuporte = usePreReformaFallback
        ? 0
        : latestMetric?.tasksClosedMonthSupport ?? 0;
      const slaAvg = latestSnap?.slaMedioMes ?? monthlyClose?.slaFinal ?? 0;
      const mttrHoras = usePreReformaFallback
        ? latestMetric?.avgResolutionHoursMonth ?? null
        : latestMetric?.avgResolutionHoursDev ?? null;
      const mttaHoras = latestMetric?.avgAckHoursSupport ?? null;
      const retornosExecucao = latestMetric?.returnedCountMonth ?? 0;
      const valorPontos = latestSnap?.valorPontos ?? monthlyClose?.valorPontos ?? 0;
      const valorDisponibilidade =
        latestSnap?.valorDisponibilidade ?? monthlyClose?.valorDisponibilidade ?? 0;
      const valorParcial = latestSnap?.valorParcial ?? monthlyClose?.valorTotal ?? 0;
      const valorIsClosed = !latestSnap && monthlyClose != null;

      const metasBatidas = goalHitsCurrent.filter(
        (h) => h.goal.category === "METRIC",
      ).length;
      const marcosBatidos = goalHitsCurrent.filter(
        (h) => h.goal.category === "MILESTONE",
      ).length;

      const prevLatestSnap = prevSnapshots.at(0);
      const hasPrevData = prevLatestMetric != null || prevLatestSnap != null;
      const evolution = hasPrevData
        ? computeEvolution(
            { pontosDev, tasksDev, slaAvg, avgResolutionHours: mttrHoras },
            {
              pontosDev: prevLatestMetric?.pointsMonthDev ?? 0,
              tasksDev: prevLatestMetric?.tasksClosedMonthDev ?? 0,
              slaAvg: prevLatestSnap?.slaMedioMes ?? 0,
              avgResolutionHours: prevLatestMetric?.avgResolutionHoursDev ?? null,
            },
          )
        : { scoreEvolucao: 0, delta: { pontosDev: 0, tasksDev: 0, slaAvg: 0, avgResolutionHours: null } };

      const serie = snapshotsInPeriod.map((s) => s.pontosAcumulados);
      const alertaAnomalia = detectAnomaly(serie);

      return {
        userId: u.id,
        name: u.name,
        pontosDev,
        tasksDev,
        tasksSuporte,
        slaAvg,
        mttrHoras,
        mttaHoras,
        wipAtual: 0,
        backlogAging: { "0-2d": 0, "3-7d": 0, "8-14d": 0, "15-30d": 0, ">30d": 0 },
        retornosExecucao,
        metasBatidas,
        marcosBatidos,
        alertaAnomalia,
        temAnotacaoPrivada: notesCount > 0,
        scoreEvolucao: evolution.scoreEvolucao,
        deltaEvolucao: evolution.delta,
        prevGoalHitsCount: 0,
        valorParcial,
        valorPontos,
        valorDisponibilidade,
        valorFechado: valorIsClosed,
      };
    }),
  );

  // Agrega KPIs da equipe
  const allCards = memberResults;
  const totalPontosDev = allCards.reduce((a, c) => a + c.pontosDev, 0);
  const totalTasksDev = allCards.reduce((a, c) => a + c.tasksDev, 0);
  const totalTasksSuporte = allCards.reduce((a, c) => a + c.tasksSuporte, 0);
  const retornosTotal = allCards.reduce((a, c) => a + c.retornosExecucao, 0);

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
    const days = Math.max(1, Math.ceil(duration / (24 * 3600_000)));
    const weeks = Math.max(1, days / 7);
    return Math.round((totalTasksDev / weeks) * 10) / 10;
  })();

  const equidade = computeTeamEquity(allCards.map((c) => c.pontosDev));

  const destaqueCard =
    allCards
      .filter((c) => c.scoreEvolucao > 0)
      .sort((a, b) => b.scoreEvolucao - a.scoreEvolucao)[0] ?? null;

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
      wipAtual: 0,
      throughputPorSemana,
      retornosExecucao: retornosTotal,
      equidade,
      backlogAging: { "0-2d": 0, "3-7d": 0, "8-14d": 0, "15-30d": 0, ">30d": 0 },
      valorTotal: allCards.reduce((a, c) => a + c.valorParcial, 0),
      valorTotalPontos: allCards.reduce((a, c) => a + c.valorPontos, 0),
      valorTotalDisponibilidade: allCards.reduce((a, c) => a + c.valorDisponibilidade, 0),
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
  });
}
