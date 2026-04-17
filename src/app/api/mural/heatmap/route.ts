import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parsePeriodFromSearchParams } from "@/lib/date";
import { getTasksForUser, getClosedAndPendingTasks } from "@/lib/clickup";
import { computeHeatmap } from "@/lib/team-metrics";
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
  const config = await loadConfig();
  const executionNormalized = new Set(
    config.executionStatuses.map(normalizeStatusName),
  );

  const users = await prisma.user.findMany({
    where: { active: true, showInMural: true, clickupUserId: { not: null } },
    select: { id: true, clickupUserId: true },
  });

  const allClosedDates: Array<{ dateClosed: number | null }> = [];
  const wipByUser = new Map<string, number>();

  const results = await Promise.all(
    users.map(async (u) => {
      if (!u.clickupUserId) return { closed: [], wip: 0 };
      try {
        const { closedInPeriod, pending } = await getClosedAndPendingTasks(
          u.clickupUserId,
          from,
          to,
        );
        const wip = pending.filter(
          (t) => t.status && executionNormalized.has(normalizeStatusName(t.status)),
        ).length;
        return { closed: closedInPeriod, wip, userId: u.id };
      } catch {
        return { closed: [], wip: 0, userId: u.id };
      }
    }),
  );

  for (const r of results) {
    for (const t of r.closed) {
      if (t.dateClosed != null) allClosedDates.push({ dateClosed: t.dateClosed });
    }
    if (r.userId) wipByUser.set(r.userId, r.wip);
  }

  return NextResponse.json({
    heatmap: computeHeatmap(allClosedDates),
    taskCount: allClosedDates.length,
    wipByUser: Object.fromEntries(wipByUser),
  });
}
