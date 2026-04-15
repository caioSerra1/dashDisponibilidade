import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  kind: z.enum(["POINTS", "TASKS_CLOSED", "SLA", "AVG_RESOLUTION", "CUSTOM"]).optional(),
  period: z.enum(["MONTH", "WEEK", "CONTINUOUS"]).optional(),
  target: z.number().positive().optional(),
  coinsReward: z.number().int().nonnegative().optional(),
  label: z.string().nullable().optional(),
  renewable: z.boolean().optional(),
  active: z.boolean().optional(),
  // allow reopening an ended goal
  reopen: z.boolean().optional(),
});

async function requireAdmin() {
  const s = await auth();
  return s?.user?.role === "ADMIN";
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { reopen, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (reopen) data.endedAt = null;
  const goal = await prisma.goal.update({ where: { id }, data });
  return NextResponse.json({ goal });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.goal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
