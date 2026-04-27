import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAvailability } from "@/lib/zabbix";
import { getWebAppSla } from "@/lib/web-monitor";
import { monthRange, currentMonth } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { year, month } = currentMonth();
  const { from, to } = monthRange(year, month);
  const now = new Date();
  const until = now < to ? now : to;

  const [hosts, apps] = await Promise.all([
    prisma.zabbixHost.findMany({ where: { enabled: true } }),
    prisma.webApp.findMany({ where: { enabled: true }, select: { id: true, name: true } }),
  ]);

  let zabbix: unknown = null;
  try {
    zabbix = await getAvailability(hosts.map((h) => h.hostId), from, until);
  } catch (e) {
    zabbix = { error: (e as Error).message };
  }

  const webapps = await Promise.all(
    apps.map(async (a) => ({
      id: a.id,
      name: a.name,
      pct: await getWebAppSla(a.id, from, until),
    })),
  );

  return NextResponse.json({
    period: { from, to, until },
    enabledHostsCount: hosts.length,
    enabledAppsCount: apps.length,
    hosts: hosts.map((h) => ({ id: h.hostId, name: h.name })),
    webapps,
    zabbix,
  });
}
