import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { currentMonth, monthRange } from "@/lib/date";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { year, month } = currentMonth();
  const { from, to } = monthRange(year, month);

  const [snapshots, last, hits, walletTxns, monthlyClose] = await Promise.all([
    prisma.taskMetricSnapshot.findMany({
      where: { userId, date: { gte: from, lte: to } },
      orderBy: { date: "asc" },
    }),
    prisma.taskMetricSnapshot.findFirst({
      where: { userId, date: { gte: from, lte: to } },
      orderBy: { date: "desc" },
    }),
    prisma.goalHit.count({ where: { goal: { userId }, year, month } }),
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
    month: { year, month },
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
        }
      : null,
    series: snapshots.map((s) => ({
      date: s.date,
      tasksClosedMonth: s.tasksClosedMonth,
      tasksClosedWeek: s.tasksClosedWeek,
      avgResolutionHoursMonth: s.avgResolutionHoursMonth,
      avgCycleHoursMonth: s.avgCycleHoursMonth,
    })),
    goalHitsThisMonth: hits,
    walletTxns,
    history: monthlyClose,
  });
}
