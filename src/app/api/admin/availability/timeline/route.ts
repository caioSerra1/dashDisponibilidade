import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeSlaTimeline } from "@/lib/web-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 3600 * 1000;
const HOUR_MS = 3600 * 1000;

/**
 * GET /api/admin/availability/timeline?type=server|app&id=X&days=N[&bucket=hour|day]
 *
 * Calcula SLA% por bucket no período. Bucket default é `day` (gráfico
 * diário). Use `hour` para período curto (até 7d).
 */
export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id");
  const days = Number(url.searchParams.get("days") ?? "30");
  const bucketParam = url.searchParams.get("bucket") ?? "day";
  const bucketMs = bucketParam === "hour" ? HOUR_MS : DAY_MS;

  if ((type !== "server" && type !== "app") || !id) {
    return NextResponse.json(
      { error: "type=server|app e id obrigatórios" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(days) || days < 1 || days > 365) {
    return NextResponse.json({ error: "days deve ser 1..365" }, { status: 400 });
  }

  const now = new Date();
  const requestedFrom = new Date(now.getTime() - days * DAY_MS);
  const to = now;

  // Pra apps, limita o início ao createdAt da WebApp (sem dado antes disso).
  let from = requestedFrom;
  if (type === "app") {
    const webApp = await prisma.webApp.findUnique({
      where: { id },
      select: { createdAt: true },
    });
    if (webApp && webApp.createdAt > requestedFrom) {
      from = webApp.createdAt;
    }
  }

  const events =
    type === "server"
      ? await prisma.serverEvent.findMany({
          where: {
            hostId: id,
            kind: "down",
            OR: [{ endedAt: null }, { endedAt: { gte: from } }],
            startedAt: { lt: to },
          },
          select: { kind: true, startedAt: true, endedAt: true },
          orderBy: { startedAt: "asc" },
        })
      : await prisma.webAppEvent.findMany({
          where: {
            webAppId: id,
            kind: { in: ["down", "monitor-gap"] },
            OR: [{ endedAt: null }, { endedAt: { gte: from } }],
            startedAt: { lt: to },
          },
          select: { kind: true, startedAt: true, endedAt: true },
          orderBy: { startedAt: "asc" },
        });

  // Normaliza monitor-gap para down (mesma semântica que getWebAppSla)
  const normalized = events.map((e) => ({
    kind: e.kind === "up" ? "up" : "down",
    startedAt: e.startedAt,
    endedAt: e.endedAt,
  }));

  const buckets = computeSlaTimeline(normalized, from, to, bucketMs);

  // SLA agregado do período inteiro
  const totalMs = to.getTime() - from.getTime();
  const totalDownMs = buckets.reduce((acc, b) => acc + b.downMs, 0);
  const aggregateSla =
    Math.max(0, Math.min(100, ((totalMs - totalDownMs) / totalMs) * 100));

  return NextResponse.json({
    period: { from, to, days, bucket: bucketParam },
    aggregateSlaPct: Math.round(aggregateSla * 100) / 100,
    totalDownMinutes: Math.round((totalDownMs / 60000) * 10) / 10,
    buckets: buckets.map((b) => ({
      start: b.start.toISOString(),
      pct: b.pct,
      downMinutes: Math.round((b.downMs / 60000) * 10) / 10,
    })),
  });
}
