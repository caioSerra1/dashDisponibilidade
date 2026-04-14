import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { currentMonth, monthRange } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const yearParam = url.searchParams.get("year");
  const monthParam = url.searchParams.get("month");
  const cur = currentMonth();
  const year = yearParam ? Number(yearParam) : cur.year;
  const month = monthParam ? Number(monthParam) : cur.month;
  const { from, to } = monthRange(year, month);

  const users = await prisma.user.findMany({
    where: { active: true, showInMural: true },
    select: { id: true, name: true, email: true, avatarPath: true, profileBio: true },
  });

  const [achievements, snapshots, closes, txns] = await Promise.all([
    prisma.userAchievement.findMany({
      where: { unlockedAt: { gte: from, lte: to } },
      include: { achievement: true },
      orderBy: { unlockedAt: "desc" },
    }),
    prisma.dailySnapshot.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: { date: "desc" },
    }),
    prisma.monthlyClose.findMany({ where: { year, month } }),
    prisma.coinTxn.findMany({
      where: { delta: { gt: 0 }, createdAt: { gte: from, lte: to } },
    }),
  ]);

  // Last snapshot per user
  const lastSnap = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    if (!lastSnap.has(s.userId)) lastSnap.set(s.userId, s);
  }

  // Coins gained in month per user
  const coinsByUser = new Map<string, number>();
  for (const t of txns) {
    coinsByUser.set(t.userId, (coinsByUser.get(t.userId) ?? 0) + t.delta);
  }

  // Achievements grouped per user
  const achByUser = new Map<string, typeof achievements>();
  for (const a of achievements) {
    if (!achByUser.has(a.userId)) achByUser.set(a.userId, []);
    achByUser.get(a.userId)!.push(a);
  }

  const cards = users.map((u) => {
    const snap = lastSnap.get(u.id);
    const close = closes.find((c) => c.userId === u.id);
    const userAchs = achByUser.get(u.id) ?? [];
    return {
      user: { id: u.id, name: u.name, email: u.email, bio: u.profileBio },
      pontos: snap?.pontosAcumulados ?? close?.pontos ?? 0,
      sla: snap?.slaMedioMes ?? close?.slaFinal ?? 0,
      coinsGained: coinsByUser.get(u.id) ?? 0,
      achievements: userAchs.map((a) => ({
        code: a.achievement.code,
        name: a.achievement.name,
        icon: a.achievement.icon,
        unlockedAt: a.unlockedAt,
      })),
      isClosed: !!close,
    };
  });

  // Ranking por pontos
  cards.sort((a, b) => b.pontos - a.pontos);

  return NextResponse.json({
    month: { year, month },
    cards,
  });
}
