import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const KIND = z.enum(["POINTS", "TASKS_CLOSED", "SLA", "AVG_RESOLUTION", "CUSTOM"]);
const PERIOD = z.enum(["MONTH", "WEEK", "CONTINUOUS"]);
const CATEGORY = z.enum(["METRIC", "MILESTONE"]);

const MILESTONE_RULE = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SLA_MIN"), value: z.number().min(0).max(100) }),
  z.object({ type: z.literal("POINTS_MIN_MONTH"), value: z.number().min(0) }),
  z.object({ type: z.literal("FIRST_MONTH_CLOSED") }),
  z.object({ type: z.literal("GOAL_HITS_IN_MONTH"), value: z.number().int().min(0) }),
  z.object({ type: z.literal("CYCLE_HOURS_MAX"), value: z.number().min(0) }),
  z.object({ type: z.literal("RESOLUTION_HOURS_MAX"), value: z.number().min(0) }),
  z.object({ type: z.literal("TASKS_CLOSED_MIN_MONTH"), value: z.number().int().min(0) }),
]);

const createSchema = z
  .object({
    userId: z.string().min(1),
    category: CATEGORY.default("METRIC"),
    kind: KIND.default("CUSTOM"),
    period: PERIOD.default("MONTH"),
    target: z.number().nonnegative().default(0),
    coinsReward: z.number().int().nonnegative(),
    label: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
    rule: MILESTONE_RULE.optional(),
    renewable: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (data) => data.category !== "METRIC" || data.target > 0,
    { message: "target deve ser maior que 0 para metas categoria METRIC", path: ["target"] },
  )
  .refine(
    (data) => data.category !== "MILESTONE" || data.rule != null,
    { message: "rule é obrigatório para metas categoria MILESTONE", path: ["rule"] },
  );

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
