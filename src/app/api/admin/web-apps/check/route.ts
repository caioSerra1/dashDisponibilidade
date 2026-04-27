import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runWebMonitorCheck } from "@/lib/web-monitor";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const r = await runWebMonitorCheck();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
