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

  const [goals, snapshot, hits, dailySnapshot] = await Promise.all([
    prisma.goal.findMany({
      where: { userId, active: true, endedAt: null },
      orderBy: [{ category: "asc" }, { createdAt: "asc" }],
    }),
    prisma.taskMetricSnapshot.findFirst({
      where: { userId, year, month },
      orderBy: { date: "desc" },
    }),
    prisma.goalHit.findMany({
      where: { goal: { userId }, year, month },
    }),
    prisma.dailySnapshot.findFirst({
      where: { userId },
      orderBy: { date: "desc" },
    }),
  ]);

  const hitGoalIds = new Set(hits.map((h) => h.goalId));

  const metrics = goals
    .filter((g) => g.category === "METRIC")
    .map((g) => {
      let current = 0;
      let label = "";
      switch (g.kind) {
        case "POINTS":
          current = snapshot?.pointsMonth ?? 0;
          label = `${current} / ${g.target} pontos`;
          break;
        case "TASKS_CLOSED":
          current =
            (g.period === "WEEK" ? snapshot?.tasksClosedWeek : snapshot?.tasksClosedMonth) ?? 0;
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
      const progress =
        g.kind === "AVG_RESOLUTION"
          ? current > 0 && current <= g.target
            ? 100
            : Math.max(0, Math.min(100, (g.target / Math.max(current, 1)) * 100))
          : Math.max(0, Math.min(100, (current / Math.max(g.target, 1)) * 100));

      return {
        id: g.id,
        category: "METRIC" as const,
        kind: g.kind,
        period: g.period,
        target: g.target,
        coinsReward: g.coinsReward,
        customLabel: g.label,
        description: g.description,
        icon: g.icon,
        current,
        label,
        progress: Math.round(progress),
        hitThisPeriod: hitGoalIds.has(g.id),
      };
    });

  const milestones = goals
    .filter((g) => g.category === "MILESTONE")
    .map((g) => {
      const unlocked = hitGoalIds.has(g.id);
      return {
        id: g.id,
        category: "MILESTONE" as const,
        coinsReward: g.coinsReward,
        customLabel: g.label,
        description: g.description,
        icon: g.icon,
        unlocked,
        progress: unlocked ? 100 : 0,
      };
    });

  return NextResponse.json({ goals: metrics, milestones });
}
