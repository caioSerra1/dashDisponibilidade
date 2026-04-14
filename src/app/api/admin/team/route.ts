import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { currentMonth, monthRange } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { year, month } = currentMonth();
  const { from, to } = monthRange(year, month);

  const users = await prisma.user.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  const snapshots = await prisma.dailySnapshot.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
  });

  const byUser = new Map<string, typeof snapshots>();
  for (const s of snapshots) {
    if (!byUser.has(s.userId)) byUser.set(s.userId, []);
    byUser.get(s.userId)!.push(s);
  }

  const rows = users.map((u) => {
    const snaps = byUser.get(u.id) ?? [];
    const last = snaps.at(-1);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      pontos: last?.pontosAcumulados ?? 0,
      sla: last?.slaMedioMes ?? 0,
      valorParcial: last?.valorParcial ?? 0,
      spark: snaps.map((s) => s.valorParcial),
    };
  });

  return NextResponse.json({ month: { year, month }, rows });
}
