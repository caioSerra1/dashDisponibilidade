import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function requireAdmin() {
  const session = await auth();
  return session?.user?.role === "ADMIN";
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const hosts = await prisma.zabbixHost.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ hosts });
}

const patchSchema = z.object({
  hostId: z.string(),
  enabled: z.boolean().optional(),
  /** Item ID do Zabbix pra usar como fonte do SLA. null = limpa override. */
  availabilityItemId: z.string().nullable().optional(),
});

export async function PATCH(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { hostId, ...data } = parsed.data;
  await prisma.zabbixHost.update({
    where: { hostId },
    data,
  });
  return NextResponse.json({ ok: true });
}
