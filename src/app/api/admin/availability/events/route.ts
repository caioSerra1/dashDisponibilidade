import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { monthRange, currentMonth } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/availability/events?type=server|app&id=X[&from=ISO&to=ISO]
 *
 * Retorna eventos de indisponibilidade no período. Sem from/to, usa o mês corrente.
 * Resposta inclui duração calculada e SLA agregado.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id");
  if ((type !== "server" && type !== "app") || !id) {
    return NextResponse.json({ error: "type=server|app e id obrigatórios" }, { status: 400 });
  }

  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  let from: Date;
  let to: Date;
  if (fromParam && toParam) {
    from = new Date(fromParam);
    to = new Date(toParam);
  } else {
    const { year, month } = currentMonth();
    const range = monthRange(year, month);
    from = range.from;
    to = range.to;
  }
  const now = new Date();
  const until = now < to ? now : to;
  const totalMs = Math.max(1, until.getTime() - from.getTime());

  const events =
    type === "server"
      ? await prisma.serverEvent.findMany({
          where: {
            hostId: id,
            OR: [{ endedAt: null }, { endedAt: { gte: from } }],
            startedAt: { lt: until },
          },
          orderBy: { startedAt: "desc" },
        })
      : await prisma.webAppEvent.findMany({
          where: {
            webAppId: id,
            kind: { in: ["down", "monitor-gap"] },
            OR: [{ endedAt: null }, { endedAt: { gte: from } }],
            startedAt: { lt: until },
          },
          orderBy: { startedAt: "desc" },
        });

  const enriched = events.map((e) => {
    const start = Math.max(e.startedAt.getTime(), from.getTime());
    const end = Math.min((e.endedAt ?? until).getTime(), until.getTime());
    const durationMs = Math.max(0, end - start);
    return {
      ...e,
      durationMinutes: Math.round((durationMs / 60000) * 10) / 10,
      ongoing: e.endedAt == null,
    };
  });

  const totalDownMs = enriched.reduce((acc, e) => {
    const start = Math.max(e.startedAt.getTime(), from.getTime());
    const end = Math.min((e.endedAt ?? until).getTime(), until.getTime());
    return acc + Math.max(0, end - start);
  }, 0);

  const slaPct = Math.max(0, Math.min(100, ((totalMs - totalDownMs) / totalMs) * 100));

  return NextResponse.json({
    period: { from, to: until },
    totalDownMinutes: Math.round((totalDownMs / 60000) * 10) / 10,
    slaPct: Math.round(slaPct * 100) / 100,
    eventCount: enriched.length,
    events: enriched,
  });
}
