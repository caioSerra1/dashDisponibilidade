import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getWebAppSla } from "@/lib/web-monitor";
import { monthRange, currentMonth } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url().max(500),
  enabled: z.boolean().optional(),
  timeoutMs: z.number().int().min(1000).max(60000).optional(),
  expectStatus: z.string().max(80).optional(),
});

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const apps = await prisma.webApp.findMany({ orderBy: { createdAt: "asc" } });
  const { year, month } = currentMonth();
  const { from, to } = monthRange(year, month);
  const now = new Date();
  const until = now < to ? now : to;

  const enriched = await Promise.all(
    apps.map(async (a) => ({
      ...a,
      slaMonthPct: a.enabled ? await getWebAppSla(a.id, from, until) : null,
    })),
  );

  return NextResponse.json({ apps: enriched });
}

export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const created = await prisma.webApp.create({
    data: {
      name: parsed.data.name,
      url: parsed.data.url,
      enabled: parsed.data.enabled ?? true,
      timeoutMs: parsed.data.timeoutMs ?? 10000,
      expectStatus: parsed.data.expectStatus ?? "2xx",
    },
  });
  return NextResponse.json({ ok: true, app: created });
}
