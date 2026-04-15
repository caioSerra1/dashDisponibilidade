import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const KIND = z.enum(["POINTS", "TASKS_CLOSED", "SLA", "AVG_RESOLUTION", "CUSTOM"]);
const PERIOD = z.enum(["MONTH", "WEEK", "CONTINUOUS"]);

const createSchema = z.object({
  userId: z.string().min(1),
  kind: KIND,
  period: PERIOD,
  target: z.number().positive(),
  coinsReward: z.number().int().nonnegative(),
  label: z.string().optional(),
  renewable: z.boolean().optional(),
  active: z.boolean().optional(),
});

async function requireAdmin() {
  const s = await auth();
  return s?.user?.role === "ADMIN";
}

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const goals = await prisma.goal.findMany({
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ goals });
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const goal = await prisma.goal.create({ data: parsed.data });
  return NextResponse.json({ goal });
}
