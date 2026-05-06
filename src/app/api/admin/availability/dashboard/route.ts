import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeAvailabilityFromEvents, computeSlaTimeline } from "@/lib/web-monitor";
import { getAvailability } from "@/lib/zabbix";
import { monthRange } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 3600 * 1000;

/**
 * GET /api/admin/availability/dashboard?days=N | ?year=YYYY&month=MM
 *
 * Visão consolidada do monitoramento. Aceita filtro por período rolante
 * (days) OU mês específico (year+month).
 *
 * SLA do servidor: lê do Zabbix em runtime via getAvailability — MESMA
 * fonte que mural e dashboard pessoal. Garante consistência entre telas.
 * Sparkline e incidentes continuam vindo do ServerEvent local.
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
  let periodLabel: string;

  if (yearParam && monthParam) {
    const year = Number(yearParam);
    const month = Number(monthParam);
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: "year/month inválidos" }, { status: 400 });
    }
    const range = monthRange(year, month);
    from = range.from;
    to = now < range.to ? now : range.to;
    periodLabel = `${month.toString().padStart(2, "0")}/${year}`;
  } else {
    const days = Number(url.searchParams.get("days") ?? "30");
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      return NextResponse.json({ error: "days deve ser 1..365" }, { status: 400 });
    }
    from = new Date(now.getTime() - days * DAY_MS);
    to = now;
    periodLabel = `${days}d`;
  }

  const [hosts, apps] = await Promise.all([
    prisma.zabbixHost.findMany({ where: { enabled: true } }),
    prisma.webApp.findMany({ where: { enabled: true } }),
  ]);

  // SLA dos servidores em UMA chamada Zabbix (consistente com mural/dashboard)
  const itemOverrides: Record<string, string> = {};
  for (const h of hosts) {
    if (h.availabilityItemId) itemOverrides[h.hostId] = h.availabilityItemId;
  }
  const zabbixSlas = hosts.length > 0
    ? await getAvailability(hosts.map((h) => h.hostId), from, to, itemOverrides).catch(() => [])
    : [];
  const zabbixSlaByHost = new Map(zabbixSlas.map((z) => [z.hostId, z.pct]));

  // Servidores: SLA AGREGADO vem do Zabbix (consistente com mural).
  // Sparkline e incidentes vêm do ServerEvent local (auditoria).
  const servers = await Promise.all(
    hosts.map(async (h) => {
      const events = await prisma.serverEvent.findMany({
        where: {
          hostId: h.hostId,
          kind: "down",
          OR: [{ endedAt: null }, { endedAt: { gte: from } }],
          startedAt: { lt: to },
        },
        select: { kind: true, startedAt: true, endedAt: true },
        orderBy: { startedAt: "asc" },
      });
      const sparkline = computeSlaTimeline(events, from, to, DAY_MS);
      const totalDownMs = sparkline.reduce((acc, b) => acc + b.downMs, 0);
      // SLA do Zabbix (oficial). Fallback: cálculo via ServerEvent.
      const slaPct = zabbixSlaByHost.get(h.hostId)
        ?? computeAvailabilityFromEvents(events, from, to);
      return {
        type: "server" as const,
        id: h.hostId,
        name: h.name,
        slaPct,
        totalDownMinutes: Math.round((totalDownMs / 60000) * 10) / 10,
        incidentCount: events.length,
        sparkline: sparkline.map((b) => ({
          start: b.start.toISOString(),
          pct: b.pct,
        })),
      };
    }),
  );

  // Aplicações
  const webapps = await Promise.all(
    apps.map(async (a) => {
      const events = await prisma.webAppEvent.findMany({
        where: {
          webAppId: a.id,
          kind: { in: ["down", "monitor-gap"] },
          OR: [{ endedAt: null }, { endedAt: { gte: from } }],
          startedAt: { lt: to },
        },
        select: { kind: true, startedAt: true, endedAt: true },
        orderBy: { startedAt: "asc" },
      });
      const normalized = events.map((e) => ({
        kind: "down",
        startedAt: e.startedAt,
        endedAt: e.endedAt,
      }));
      // Limita o início ao createdAt da WebApp pra não mostrar 100% fake
      // em dias anteriores ao cadastro (não tinha como medir).
      const effectiveFrom = a.createdAt > from ? a.createdAt : from;
      const sparkline = computeSlaTimeline(normalized, effectiveFrom, to, DAY_MS);
      const slaPct = computeAvailabilityFromEvents(normalized, effectiveFrom, to);
      const totalDownMs = sparkline.reduce((acc, b) => acc + b.downMs, 0);
      const incidentCount = events.filter((e) => e.kind === "down").length;
      const gapCount = events.filter((e) => e.kind === "monitor-gap").length;
      return {
        type: "app" as const,
        id: a.id,
        name: a.name,
        url: a.url,
        slaPct,
        totalDownMinutes: Math.round((totalDownMs / 60000) * 10) / 10,
        incidentCount,
        gapCount,
        lastCheckAt: a.lastCheckAt,
        lastStatusCode: a.lastStatusCode,
        lastResponseMs: a.lastResponseMs,
        lastError: a.lastError,
        sparkline: sparkline.map((b) => ({
          start: b.start.toISOString(),
          pct: b.pct,
        })),
      };
    }),
  );

  // Agregado: média ponderada simples (peso igual)
  const targets = [...servers, ...webapps];
  const measurable = targets.filter((t) => t.slaPct != null);
  const aggregateSla =
    measurable.length === 0
      ? 100
      : measurable.reduce((acc, t) => acc + (t.slaPct ?? 0), 0) / measurable.length;

  const totalIncidents = targets.reduce((acc, t) => acc + t.incidentCount, 0);
  const totalGaps = webapps.reduce((acc, t) => acc + t.gapCount, 0);
  const totalDownMinutes = targets.reduce((acc, t) => acc + t.totalDownMinutes, 0);

  return NextResponse.json({
    period: { from, to, label: periodLabel },
    summary: {
      aggregateSlaPct: Math.floor(aggregateSla * 100) / 100,
      totalIncidents,
      totalGaps,
      totalDownMinutes: Math.round(totalDownMinutes * 10) / 10,
      targetsCount: targets.length,
    },
    servers,
    webapps,
  });
}
