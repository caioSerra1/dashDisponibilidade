import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runDaily, runClose, syncZabbixHosts } from "@/lib/orchestrator";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "daily";
  try {
    if (kind === "hosts") {
      const r = await syncZabbixHosts();
      return NextResponse.json({ ok: true, ...r });
    }
    if (kind === "close") {
      const year = Number(url.searchParams.get("year"));
      const month = Number(url.searchParams.get("month"));
      const force = url.searchParams.get("force") === "1";
      if (!year || !month || month < 1 || month > 12) {
        return NextResponse.json({ error: "year e month obrigatórios" }, { status: 400 });
      }
      const r = await runClose({ year, month, force });
      return NextResponse.json({ ok: true, ...r });
    }
    const r = await runDaily();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
