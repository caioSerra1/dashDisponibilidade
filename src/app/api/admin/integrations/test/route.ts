import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { testClickUp } from "@/lib/clickup";
import { testZabbix } from "@/lib/zabbix";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const [clickup, zabbix] = await Promise.all([testClickUp(), testZabbix()]);
  return NextResponse.json({ clickup, zabbix });
}
