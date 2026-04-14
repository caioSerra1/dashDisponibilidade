import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  xp: z.number().int().nonnegative().optional(),
  coinsReward: z.number().int().nonnegative().optional(),
  rule: z.any().optional(),
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
  const a = await prisma.achievement.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ achievement: a });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.achievement.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
