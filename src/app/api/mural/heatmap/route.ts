import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parsePeriodFromSearchParams } from "@/lib/date";
import { getTasksForUser } from "@/lib/clickup";
import { computeHeatmap } from "@/lib/team-metrics";

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

  const users = await prisma.user.findMany({
    where: { active: true, showInMural: true, clickupUserId: { not: null } },
    select: { clickupUserId: true },
  });

  const allClosedDates: Array<{ dateClosed: number | null }> = [];

  const results = await Promise.all(
    users.map(async (u) => {
      if (!u.clickupUserId) return [];
      try {
        return await getTasksForUser(u.clickupUserId, from, to);
      } catch {
        return [];
      }
    }),
  );

  for (const tasks of results) {
    for (const t of tasks) {
      if (t.dateClosed != null) allClosedDates.push({ dateClosed: t.dateClosed });
    }
  }

  return NextResponse.json({
    heatmap: computeHeatmap(allClosedDates),
    taskCount: allClosedDates.length,
  });
}
