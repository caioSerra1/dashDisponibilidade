import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { monthRange } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 3600 * 1000;

/**
 * GET /api/admin/availability/incidents?days=N | ?year=YYYY&month=MM
 *
 * Lista TODOS os incidentes (ServerEvent + WebAppEvent) do período,
 * ordenados por data desc. Cada item tem: target, tipo, início, fim,
 * duração, severidade/code, descrição.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const yearParam = url.searchParams.get("year");
  const monthParam = url.searchParams.get("month");
  const now = new Date();
  let from: Date;
  let to: Date;
  let label: string;

  if (yearParam && monthParam) {
    const year = Number(yearParam);
    const month = Number(monthParam);
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: "year/month inválidos" }, { status: 400 });
    }
    const range = monthRange(year, month);
    from = range.from;
    to = now < range.to ? now : range.to;
    label = `${month.toString().padStart(2, "0")}/${year}`;
  } else {
    const days = Number(url.searchParams.get("days") ?? "30");
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      return NextResponse.json({ error: "days deve ser 1..365" }, { status: 400 });
    }
    from = new Date(now.getTime() - days * DAY_MS);
    to = now;
    label = `${days}d`;
  }

  const [serverEvents, webEvents, hosts, apps] = await Promise.all([
    prisma.serverEvent.findMany({
      where: {
        OR: [{ endedAt: null }, { endedAt: { gte: from } }],
        startedAt: { lt: to },
      },
      orderBy: { startedAt: "desc" },
    }),
    prisma.webAppEvent.findMany({
      where: {
        kind: { in: ["down", "monitor-gap"] },
        OR: [{ endedAt: null }, { endedAt: { gte: from } }],
        startedAt: { lt: to },
      },
      orderBy: { startedAt: "desc" },
    }),
    prisma.zabbixHost.findMany({ select: { hostId: true, name: true } }),
    prisma.webApp.findMany({ select: { id: true, name: true, url: true } }),
  ]);

  const hostName = new Map(hosts.map((h) => [h.hostId, h.name]));
  const appInfo = new Map(apps.map((a) => [a.id, { name: a.name, url: a.url }]));

  function durationMin(startedAt: Date, endedAt: Date | null): number {
    const start = Math.max(startedAt.getTime(), from.getTime());
    const end = Math.min((endedAt ?? to).getTime(), to.getTime());
    return Math.max(0, Math.round(((end - start) / 60000) * 10) / 10);
  }

  const incidents = [
    ...serverEvents.map((e) => ({
      id: e.id,
      type: "server" as const,
      targetId: e.hostId,
      targetName: hostName.get(e.hostId) ?? `Host ${e.hostId}`,
      targetUrl: null,
      kind: e.kind,
      startedAt: e.startedAt,
      endedAt: e.endedAt,
      durationMinutes: durationMin(e.startedAt, e.endedAt),
      ongoing: e.endedAt == null,
      severity: e.severity,
      triggerName: e.triggerName,
      itemKey: e.itemKey,
      statusCode: null as number | null,
      errorMessage: null as string | null,
    })),
    ...webEvents.map((e) => ({
      id: e.id,
      type: "app" as const,
      targetId: e.webAppId,
      targetName: appInfo.get(e.webAppId)?.name ?? `App ${e.webAppId}`,
      targetUrl: appInfo.get(e.webAppId)?.url ?? null,
      kind: e.kind,
      startedAt: e.startedAt,
      endedAt: e.endedAt,
      durationMinutes: durationMin(e.startedAt, e.endedAt),
      ongoing: e.endedAt == null,
      severity: null as number | null,
      triggerName: null as string | null,
      itemKey: null as string | null,
      statusCode: e.statusCode,
      errorMessage: e.errorMessage,
    })),
  ].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

  const totalDownMinutes = incidents.reduce((acc, i) => acc + i.durationMinutes, 0);
  const ongoingCount = incidents.filter((i) => i.ongoing).length;

  return NextResponse.json({
    period: { from, to, label },
    summary: {
      total: incidents.length,
      ongoing: ongoingCount,
      totalDownMinutes: Math.round(totalDownMinutes * 10) / 10,
    },
    incidents,
  });
}
