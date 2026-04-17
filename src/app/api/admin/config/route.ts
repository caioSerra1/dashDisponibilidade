import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { loadConfig, saveConfig } from "@/lib/config";
import { prisma } from "@/lib/db";

const idArray = z.array(z.string().min(1).max(64)).max(100);

const schema = z.object({
  valorDisponibilidade100: z.number().min(0).optional(),
  valorPorPonto: z.number().min(0).optional(),
  metaPontosMes: z.number().min(0).optional(),
  metaSlaStreak: z.number().min(0).max(100).optional(),
  maxExecDays: z.number().int().min(0).max(365).optional(),
  executionStatuses: z.array(z.string().min(1).max(80)).max(50).optional(),
  taskClassification: z
    .object({
      dev: z.object({
        listIds: idArray.default([]),
        folderIds: idArray.default([]),
      }),
      support: z.object({
        listIds: idArray.default([]),
        folderIds: idArray.default([]),
      }),
    })
    .optional(),
  tiers: z
    .array(
      z.object({
        minPct: z.number().min(0).max(100),
        payoutPct: z.number().min(0).max(100),
      }),
    )
    .optional(),
});

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const config = await loadConfig();
  const tiers = await prisma.slaTier.findMany({ orderBy: { minPct: "desc" } });
  return NextResponse.json({ config, tiers });
}

export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { tiers, ...cfg } = parsed.data;
  await saveConfig(cfg);
  if (tiers) {
    await prisma.$transaction([
      prisma.slaTier.deleteMany({}),
      prisma.slaTier.createMany({
        data: tiers.map((t, i) => ({ ...t, order: i })),
      }),
    ]);
  }
  return NextResponse.json({ ok: true });
}
