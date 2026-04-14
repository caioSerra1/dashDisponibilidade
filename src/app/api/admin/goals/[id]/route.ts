import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  target: z.number().positive().optional(),
  coinsReward: z.number().int().nonnegative().optional(),
  label: z.string().nullable().optional(),
  active: z.boolean().optional(),
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
  const goal = await prisma.goal.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ goal });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.goal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
