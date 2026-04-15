import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parsePeriodFromSearchParams } from "@/lib/date";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const url = new URL(request.url);
  const periodo = parsePeriodFromSearchParams(url.searchParams);
  const { from, to } = periodo;

  const [snapshots, last, hits, walletTxns, monthlyClose] = await Promise.all([
    prisma.taskMetricSnapshot.findMany({
      where: { userId, date: { gte: from, lte: to } },
      orderBy: { date: "asc" },
    }),
    prisma.taskMetricSnapshot.findFirst({
      where: { userId, date: { gte: from, lte: to } },
      orderBy: { date: "desc" },
    }),
    prisma.goalHit.count({
      where: { goal: { userId }, hitAt: { gte: from, lte: to } },
    }),
    prisma.coinTxn.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.monthlyClose.findMany({
      where: { userId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 6,
    }),
  ]);

  return NextResponse.json({
    periodo: {
      modo: periodo.mode,
      de: from.toISOString(),
      ate: to.toISOString(),
      label: periodo.label,
    },
    last: last
      ? {
          tasksClosedMonth: last.tasksClosedMonth,
          tasksClosedWeek: last.tasksClosedWeek,
          pointsMonth: last.pointsMonth,
          avgResolutionHoursMonth: last.avgResolutionHoursMonth,
          avgCycleHoursMonth: last.avgCycleHoursMonth,
          throughputPerWeek: last.throughputPerWeek,
          tagsBreakdown: last.tagsBreakdown,
          priorityBreakdown: last.priorityBreakdown,
          date: last.date,
          // Segmentado dev/suporte
          dev: {
            tasksClosed: last.tasksClosedMonthDev,
            points: last.pointsMonthDev,
            avgResolutionHours: last.avgResolutionHoursDev,
            avgCycleHours: last.avgCycleHoursDev,
          },
          support: {
            tasksClosed: last.tasksClosedMonthSupport,
            avgResolutionHours: last.avgResolutionHoursSupport,
            avgCycleHours: last.avgCycleHoursSupport,
            avgAckHours: last.avgAckHoursSupport,
          },
          returnedCount: last.returnedCountMonth,
        }
      : null,
    series: snapshots.map((s) => ({
      date: s.date,
      tasksClosedMonth: s.tasksClosedMonth,
      tasksClosedWeek: s.tasksClosedWeek,
      avgResolutionHoursMonth: s.avgResolutionHoursMonth,
      avgCycleHoursMonth: s.avgCycleHoursMonth,
      tasksClosedDev: s.tasksClosedMonthDev,
      tasksClosedSupport: s.tasksClosedMonthSupport,
    })),
    goalHits: hits,
    walletTxns,
    history: monthlyClose,
  });
}
