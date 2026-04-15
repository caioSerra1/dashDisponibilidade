import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { currentMonth } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { year, month } = currentMonth();

  const [goals, snapshot, hits] = await Promise.all([
    prisma.goal.findMany({
      where: { userId, active: true, endedAt: null },
      orderBy: { createdAt: "asc" },
    }),
    prisma.taskMetricSnapshot.findFirst({
      where: { userId, year, month },
      orderBy: { date: "desc" },
    }),
    prisma.goalHit.findMany({
      where: { goal: { userId }, year, month },
    }),
  ]);

  const dailySnapshot = await prisma.dailySnapshot.findFirst({
    where: { userId },
    orderBy: { date: "desc" },
  });

  const hitGoalIds = new Set(hits.map((h) => h.goalId));

  const enriched = goals.map((g) => {
    let current: number = 0;
    let label = "";
    switch (g.kind) {
      case "POINTS":
        current = snapshot?.pointsMonth ?? 0;
        label = `${current} / ${g.target} pontos`;
        break;
      case "TASKS_CLOSED":
        current = (g.period === "WEEK" ? snapshot?.tasksClosedWeek : snapshot?.tasksClosedMonth) ?? 0;
        label = `${current} / ${g.target} tarefas`;
        break;
      case "SLA":
        current = dailySnapshot?.slaMedioMes ?? 0;
        label = `${current.toFixed(2)}% / ${g.target}%`;
        break;
      case "AVG_RESOLUTION":
        current = snapshot?.avgResolutionHoursMonth ?? 0;
        label = `${current?.toFixed(1) ?? "—"}h (meta ≤ ${g.target}h)`;
        break;
      default:
        current = 0;
        label = g.label ?? "";
    }
    const progress = g.kind === "AVG_RESOLUTION"
      ? current > 0 && current <= g.target ? 100 : Math.max(0, Math.min(100, (g.target / Math.max(current, 1)) * 100))
      : Math.max(0, Math.min(100, (current / g.target) * 100));

    return {
      id: g.id,
      kind: g.kind,
      period: g.period,
      target: g.target,
      coinsReward: g.coinsReward,
      customLabel: g.label,
      current,
      label,
      progress: Math.round(progress),
      hitThisPeriod: hitGoalIds.has(g.id),
    };
  });

  return NextResponse.json({ goals: enriched });
}
