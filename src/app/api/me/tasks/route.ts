import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getAllAssignedTasks,
  getTimeInStatus,
  findExecutionStartMs,
  type AuditedTask,
} from "@/lib/clickup";
import { loadConfig } from "@/lib/config";
import { currentMonth, monthRange } from "@/lib/date";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOUR_MS = 3600_000;
const CACHE_TTL_MS = 5 * 60 * 1000;

interface TaskRow extends AuditedTask {
  resolutionHours: number | null;
  cycleHours: number | null;
  executionStartMs: number | null;
  passedExecution: boolean;
  ageHours: number | null;
}

interface CachedPayload {
  body: unknown;
  storedAt: number;
}

const cache = new Map<string, CachedPayload>();

function cacheKey(userId: string, year: number, month: number): string {
  return `${userId}:${year}-${month}`;
}

function avg(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

async function enrichClosed(
  tasks: AuditedTask[],
  executionStatuses: string[],
): Promise<{ rows: TaskRow[]; tisEnabled: boolean | null; tisMessage?: string }> {
  const now = Date.now();

  const results = await Promise.all(
    tasks.map((t) =>
      getTimeInStatus(t.id).catch((e) => ({
        ok: false as const,
        history: [],
        current: null,
        message: (e as Error).message,
      })),
    ),
  );

  const okCount = results.filter((r) => r.ok).length;
  const tisEnabled: boolean | null =
    results.length === 0 ? null : okCount > 0;
  const tisMessage = results.find((r) => !r.ok)?.message;

  const rows: TaskRow[] = tasks.map((t, i) => {
    const tis = results[i]!;
    const executionStart = tis.ok
      ? findExecutionStartMs(tis.history, tis.current, executionStatuses)
      : null;

    const resolutionHours =
      t.dateClosed != null && t.dateCreated != null
        ? Math.round(((t.dateClosed - t.dateCreated) / HOUR_MS) * 100) / 100
        : null;

    const cycleHours =
      t.dateClosed != null && executionStart != null
        ? Math.round(((t.dateClosed - executionStart) / HOUR_MS) * 100) / 100
        : null;

    return {
      ...t,
      resolutionHours,
      cycleHours,
      executionStartMs: executionStart,
      passedExecution: executionStart != null,
      ageHours:
        t.dateCreated != null
          ? Math.round(((now - t.dateCreated) / HOUR_MS) * 100) / 100
          : null,
    };
  });

  return { rows, tisEnabled, tisMessage };
}

function enrichPending(tasks: AuditedTask[]): TaskRow[] {
  const now = Date.now();
  return tasks.map((t) => ({
    ...t,
    resolutionHours: null,
    cycleHours: null,
    executionStartMs: null,
    passedExecution: false,
    ageHours:
      t.dateCreated != null
        ? Math.round(((now - t.dateCreated) / HOUR_MS) * 100) / 100
        : null,
  }));
}

async function buildPayload(
  clickupUserId: string,
  year: number,
  month: number,
): Promise<unknown> {
  const config = await loadConfig();
  const { from, to } = monthRange(year, month);

  const { closedInPeriod, pending } = await getAllAssignedTasks(
    clickupUserId,
    from,
    to,
  );

  const { rows: closed, tisEnabled, tisMessage } = await enrichClosed(
    closedInPeriod,
    config.executionStatuses,
  );
  const pendingEnriched = enrichPending(pending);

  const cycleValues = closed
    .map((t) => t.cycleHours)
    .filter((h): h is number => h != null);
  const resolutionValues = closed
    .map((t) => t.resolutionHours)
    .filter((h): h is number => h != null);

  return {
    month: { year, month },
    clickupUserId,
    executionStatuses: config.executionStatuses,
    tis: {
      enabled: tisEnabled,
      message: tisMessage,
    },
    closed: {
      total: closed.length,
      pointsTotal: closed.reduce((acc, t) => acc + (t.points ?? 0), 0),
      countedForCycle: cycleValues.length,
      skippedNoExecution: closed.filter((t) => !t.passedExecution).length,
      avgCycleHours: avg(cycleValues),
      avgResolutionHours: avg(resolutionValues),
      tasks: closed,
    },
    pending: {
      total: pendingEnriched.length,
      pointsTotal: pendingEnriched.reduce((acc, t) => acc + (t.points ?? 0), 0),
      tasks: pendingEnriched,
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
      closed: {
        total: 0,
        pointsTotal: 0,
        avgCycleHours: null,
        avgResolutionHours: null,
        tasks: [],
      },
      pending: { total: 0, pointsTotal: 0, tasks: [] },
      reason: "Sem ID ClickUp vinculado.",
    });
  }

  const { year, month } = currentMonth();
  const key = cacheKey(user.clickupUserId, year, month);
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  if (!force) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.storedAt < CACHE_TTL_MS) {
      return NextResponse.json(hit.body, {
        headers: { "x-cache": "HIT" },
      });
    }
  }

  try {
    const body = await buildPayload(user.clickupUserId, year, month);
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
