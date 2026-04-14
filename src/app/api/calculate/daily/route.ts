import { NextResponse } from "next/server";
import { runDaily } from "@/lib/orchestrator";
import { assertCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertCronAuth(request);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runDaily();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
