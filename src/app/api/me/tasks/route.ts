import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getClosedAndPendingTasks, type AuditedTask } from "@/lib/clickup";
import { loadConfig } from "@/lib/config";
import { parsePeriodFromSearchParams } from "@/lib/date";
import { classifyTask, type TaskType } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOUR_MS = 3600_000;
const CACHE_TTL_MS = 15 * 60 * 1000;

interface TaskRow extends AuditedTask {
  resolutionHours: number | null;
  ageHours: number | null;
  type: TaskType;
}

interface CachedPayload {
  body: unknown;
  storedAt: number;
}

const cache = new Map<string, CachedPayload>();

function avg(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

async function buildPayload(
  clickupUserId: string,
  from: Date,
  to: Date,
): Promise<unknown> {
  const config = await loadConfig();
  const classify = (t: AuditedTask): TaskType =>
    classifyTask(
      { listId: t.listId, folderId: t.folderId, points: t.points },
      config.taskClassification,
    );

  const { closedInPeriod, pending } = await getClosedAndPendingTasks(
    clickupUserId,
    from,
    to,
  );

  const now = Date.now();

  const closed: TaskRow[] = closedInPeriod.map((t) => ({
    ...t,
    resolutionHours:
      t.dateClosed != null && t.dateCreated != null
        ? Math.round(((t.dateClosed - t.dateCreated) / HOUR_MS) * 100) / 100
        : null,
    ageHours: null,
    type: classify(t),
  }));

  const pendingRows: TaskRow[] = pending.map((t) => ({
    ...t,
    resolutionHours: null,
    ageHours:
      t.dateCreated != null
        ? Math.round(((now - t.dateCreated) / HOUR_MS) * 100) / 100
        : null,
    type: classify(t),
  }));

  const resolutionValues = closed
    .map((t) => t.resolutionHours)
    .filter((h): h is number => h != null);

  const pointsTotal = closed
    .filter((t) => t.type === "dev")
    .reduce((acc, t) => acc + (t.points ?? 0), 0);

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    clickupUserId,
    closed: {
      total: closed.length,
      pointsTotal,
      avgResolutionHours: avg(resolutionValues),
      tasks: closed,
    },
    pending: {
      total: pendingRows.length,
      pointsTotal: pendingRows
        .filter((t) => t.type === "dev")
        .reduce((acc, t) => acc + (t.points ?? 0), 0),
      tasks: pendingRows,
    },
  };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { clickupUserId: true },
  });
  if (!user?.clickupUserId) {
    return NextResponse.json({
      closed: { total: 0, pointsTotal: 0, avgResolutionHours: null, tasks: [] },
      pending: { total: 0, pointsTotal: 0, tasks: [] },
      reason: "Sem ID ClickUp vinculado.",
    });
  }

  const url = new URL(req.url);
  const periodo = parsePeriodFromSearchParams(url.searchParams);
  const periodKey = `${periodo.mode}:${periodo.from.toISOString()}:${periodo.to.toISOString()}`;
  const key = `${user.clickupUserId}:${periodKey}`;
  const force = url.searchParams.get("force") === "1";

  if (!force) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.storedAt < CACHE_TTL_MS) {
      return NextResponse.json(hit.body, { headers: { "x-cache": "HIT" } });
    }
  }

  try {
    const body = await buildPayload(user.clickupUserId, periodo.from, periodo.to);
    cache.set(key, { body, storedAt: Date.now() });
    return NextResponse.json(body, { headers: { "x-cache": "MISS" } });
  } catch (e) {
    console.error("[api/me/tasks] failed", e);
    return NextResponse.json(
      { error: "Falha ao carregar tasks do ClickUp." },
      { status: 502 },
    );
  }
}
