import { NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { getServerSla, getWebAppSla } from "@/lib/web-monitor";
import { monthRange, currentMonth } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Audit semanal automatizado. Disparado por cron remoto autenticado via
 * `x-cron-secret`. Não toca em nada — só lê e reporta.
 *
 * Verifica:
 *  - JobRuns dos últimos 7 dias: alguma falha (status=error)?
 *  - Eventos `monitor-gap` longos (> 30min) nos últimos 7 dias
 *  - SLA atual de cada host/webapp habilitado (mês corrente)
 *
 * Retorna JSON com flag `needsAttention` que o agent usa pra decidir se
 * abre issue no GitHub.
 */
export async function GET(request: Request) {
  try {
    assertCronAuth(request);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const { year, month } = currentMonth();
  const { from, to } = monthRange(year, month);
  const until = now < to ? now : to;

  // 1. JobRuns com status=error nos últimos 7 dias
  const failedJobs = await prisma.jobRun.findMany({
    where: { startedAt: { gte: sevenDaysAgo }, status: "error" },
    orderBy: { startedAt: "desc" },
    select: { id: true, job: true, startedAt: true, message: true },
    take: 20,
  });

  // 2. monitor-gap > 30min nos últimos 7 dias
  const longGaps = await prisma.webAppEvent.findMany({
    where: {
      kind: "monitor-gap",
      startedAt: { gte: sevenDaysAgo },
    },
    include: { webApp: { select: { name: true, url: true } } },
    orderBy: { startedAt: "desc" },
  });
  const gapsOver30 = longGaps.filter((g) => {
    const end = (g.endedAt ?? now).getTime();
    const durationMin = (end - g.startedAt.getTime()) / 60000;
    return durationMin > 30;
  });

  // 3. SLA atual de cada host habilitado
  const enabledHosts = await prisma.zabbixHost.findMany({ where: { enabled: true } });
  const serverSlas = await Promise.all(
    enabledHosts.map(async (h) => ({
      hostId: h.hostId,
      name: h.name,
      slaPct: await getServerSla(h.hostId, from, until),
    })),
  );

  // 4. SLA atual de cada webapp habilitada
  const enabledApps = await prisma.webApp.findMany({ where: { enabled: true } });
  const appSlas = await Promise.all(
    enabledApps.map(async (a) => ({
      id: a.id,
      name: a.name,
      url: a.url,
      slaPct: await getWebAppSla(a.id, from, until),
      lastCheckAt: a.lastCheckAt,
      lastError: a.lastError,
    })),
  );

  // 5. Contagem de incidentes da semana
  const incidentsThisWeek = await prisma.serverEvent.count({
    where: { kind: "down", startedAt: { gte: sevenDaysAgo } },
  });
  const webIncidentsThisWeek = await prisma.webAppEvent.count({
    where: { kind: "down", startedAt: { gte: sevenDaysAgo } },
  });

  const needsAttention =
    failedJobs.length > 0 || gapsOver30.length > 0;

  return NextResponse.json({
    timestamp: now.toISOString(),
    period: { from, to: until },
    needsAttention,
    summary: {
      failedJobsCount: failedJobs.length,
      gapsOver30MinCount: gapsOver30.length,
      serverIncidentsLast7d: incidentsThisWeek,
      webIncidentsLast7d: webIncidentsThisWeek,
    },
    failedJobs,
    gapsOver30,
    serverSlas,
    appSlas,
  });
}
