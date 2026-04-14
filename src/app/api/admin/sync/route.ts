import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runDaily, syncZabbixHosts } from "@/lib/orchestrator";

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
    const r = await runDaily();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
