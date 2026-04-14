import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const ruleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SLA_MIN"), value: z.number() }),
  z.object({ type: z.literal("POINTS_MIN_MONTH"), value: z.number() }),
  z.object({ type: z.literal("FIRST_MONTH_CLOSED") }),
  z.object({ type: z.literal("GOAL_HITS_IN_MONTH"), value: z.number() }),
  z.object({ type: z.literal("CYCLE_HOURS_MAX"), value: z.number() }),
  z.object({ type: z.literal("RESOLUTION_HOURS_MAX"), value: z.number() }),
  z.object({ type: z.literal("TASKS_CLOSED_MIN_MONTH"), value: z.number() }),
]);

const createSchema = z.object({
  code: z.string().min(2).max(40).regex(/^[A-Z0-9_]+$/),
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(280),
  icon: z.string().min(1).max(40),
  xp: z.number().int().nonnegative(),
  coinsReward: z.number().int().nonnegative(),
  rule: ruleSchema,
  active: z.boolean().optional(),
});

async function requireAdmin() {
  const s = await auth();
  return s?.user?.role === "ADMIN";
}

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const achievements = await prisma.achievement.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ achievements });
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const a = await prisma.achievement.create({ data: parsed.data });
  return NextResponse.json({ achievement: a });
}
