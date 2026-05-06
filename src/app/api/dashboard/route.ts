import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  currentMonth,
  daysInMonth,
  monthRange,
  parsePeriodFromSearchParams,
} from "@/lib/date";
import { computeStreak } from "@/lib/gamification";
import { loadConfig } from "@/lib/config";
import { computePartial } from "@/lib/calculate";
import { getTeamSlaForPeriod } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface HostBreakdownEntry {
  hostId: string;
  name: string;
  pct: number;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("userId");

  // Admin pode consultar dashboard de outro colaborador via ?userId=
  let userId = session.user.id;
  if (targetUserId && targetUserId !== session.user.id) {
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    userId = targetUserId;
  }

  const periodo = parsePeriodFromSearchParams(url.searchParams);
  const { from, to } = periodo;
  const { year, month } = currentMonth();
  // Pra projeção linear, sempre usamos o mês corrente (faz sentido só no "mês").
  const projectionMonth = monthRange(year, month);

  const [snapshots, taskMetric, history, config, tiers, teamSla] = await Promise.all([
    prisma.dailySnapshot.findMany({
      where: { userId, date: { gte: from, lte: to } },
      orderBy: { date: "asc" },
    }),
    prisma.taskMetricSnapshot.findFirst({
      where: { userId, date: { gte: from, lte: to } },
      orderBy: { date: "desc" },
    }),
    prisma.monthlyClose.findMany({
      where: { userId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 12,
    }),
    loadConfig(),
    prisma.slaTier.findMany({ orderBy: { minPct: "desc" } }),
    getTeamSlaForPeriod(year, month, to),
  ]);

  const last = snapshots.at(-1);
  const previous = snapshots.length > 1 ? snapshots.at(-2) : null;
  const streak = computeStreak(
    snapshots.map((s) => ({ date: s.date, slaMedioMes: s.slaMedioMes })),
    config.metaSlaStreak,
  );

  // Projeção linear do mês corrente (só faz sentido no modo "mês")
  const now = new Date();
  const today = now.getUTCDate();
  const totalDays = daysInMonth(year, month);
  const diasRestantes = Math.max(0, totalDays - today);
  const diasDecorridos = Math.max(1, today);
  const latestMonthSnap = await prisma.dailySnapshot.findFirst({
    where: {
      userId,
      date: { gte: projectionMonth.from, lte: projectionMonth.to },
    },
    orderBy: { date: "desc" },
  });
  // Projeção: SOMENTE pontos acumulam linearmente. Disponibilidade é paga
  // uma vez no fim do mês (não acumula por dia). Recalcula via computePartial
  // com SLA + tiers ATUAIS pra refletir mudanças de config.
  const projecaoPontos = latestMonthSnap
    ? Math.round((latestMonthSnap.pontosAcumulados / diasDecorridos) * totalDays)
    : 0;
  const projecaoCalc = latestMonthSnap
    ? computePartial({
        pontosMes: projecaoPontos,
        slaMedioMes: teamSla.media,
        valorPorPonto: config.valorPorPonto,
        valorDisponibilidade100: config.valorDisponibilidade100,
        tiers,
      })
    : null;
  const projecaoValor = projecaoCalc?.valorParcial ?? 0;
  const deltaDia = last && previous ? last.valorParcial - previous.valorParcial : 0;

  return NextResponse.json({
    periodo: {
      modo: periodo.mode,
      de: from.toISOString(),
      ate: to.toISOString(),
      label: periodo.label,
    },
    month: { year, month, totalDays, diasDecorridos, diasRestantes },
    parcial: last
      ? (() => {
          // SEMPRE recalcula com tiers/config ATUAIS (não confiar em valor
          // stale do snapshot — tiers podem ter mudado depois do último daily).
          // teamSla.media é o SLA da equipe AGORA (não o do snapshot).
          const recalc = computePartial({
            pontosMes: last.pontosAcumulados,
            slaMedioMes: teamSla.media,
            valorPorPonto: config.valorPorPonto,
            valorDisponibilidade100: config.valorDisponibilidade100,
            tiers,
          });
          return {
            pontos: last.pontosAcumulados,
            sla: teamSla.media,
            valorPontos: recalc.valorPontos,
            valorDisponibilidade: recalc.valorDisponibilidade,
            valorParcial: recalc.valorParcial,
            date: last.date,
            // hostBreakdown SEMPRE do teamSla atual (não do snapshot stale)
            hostBreakdown: teamSla.breakdown.map((b) => ({
              hostId: b.hostId,
              name: b.name,
              pct: b.pct ?? 100,
              type: b.type,
            })),
          };
        })()
      : null,
    suporte: taskMetric
      ? {
          tasksClosed: taskMetric.tasksClosedMonthSupport,
          avgAckHours: taskMetric.avgAckHoursSupport,
          avgResolutionHours: taskMetric.avgResolutionHoursSupport,
        }
      : null,
    projecao: {
      pontos: projecaoPontos,
      valorTotal: projecaoValor,
      deltaDia,
    },
    snapshots: snapshots.map((s) => ({
      date: s.date,
      valorParcial: s.valorParcial,
      pontos: s.pontosAcumulados,
      sla: s.slaMedioMes,
    })),
    history: history.map((h) => ({
      year: h.year,
      month: h.month,
      pontos: h.pontos,
      slaFinal: h.slaFinal,
      valorTotal: h.valorTotal,
      closedAt: h.closedAt,
    })),
    streak: {
      dias: streak,
      metaSla: config.metaSlaStreak,
      metaPontos: config.metaPontosMes,
    },
  });
}
