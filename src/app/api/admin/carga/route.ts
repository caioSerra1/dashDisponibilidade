import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getClosedAndPendingTasks, normalizeStatusName } from "@/lib/clickup";
import { loadConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const config = await loadConfig();
  const executionNormalized = new Set(
    config.executionStatuses.map(normalizeStatusName),
  );

  const users = await prisma.user.findMany({
    where: { active: true, clickupUserId: { not: null } },
    select: { id: true, name: true, clickupUserId: true },
  });

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const members = await Promise.all(
    users.map(async (u) => {
      if (!u.clickupUserId) return null;
      try {
        const { pending } = await getClosedAndPendingTasks(u.clickupUserId, from, now);

        const inExecution = pending
          .filter((t) => t.status && executionNormalized.has(normalizeStatusName(t.status)))
          .map((t) => ({
            id: t.id,
            customId: t.customId,
            name: t.name,
            points: t.points,
            priority: t.priority,
            status: t.status,
            dateCreated: t.dateCreated,
            url: t.url,
            listId: t.listId,
          }));

        const otherOpen = pending.filter(
          (t) => !t.status || !executionNormalized.has(normalizeStatusName(t.status)),
        ).length;

        return {
          userId: u.id,
          name: u.name,
          inExecution,
          otherOpen,
          totalOpen: pending.length,
        };
      } catch {
        return { userId: u.id, name: u.name, inExecution: [], otherOpen: 0, totalOpen: 0 };
      }
    }),
  );

  const valid = members.filter((m) => m != null);
  valid.sort((a, b) => b.inExecution.length - a.inExecution.length);

  return NextResponse.json({ members: valid });
}
