import { NextResponse } from "next/server";
import { runClose } from "@/lib/orchestrator";
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
    const url = new URL(request.url);
    const yearParam = url.searchParams.get("year");
    const monthParam = url.searchParams.get("month");
    const target =
      yearParam && monthParam
        ? { year: Number(yearParam), month: Number(monthParam) }
        : undefined;
    const result = await runClose(target);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
