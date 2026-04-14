import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listForUser, unreadCount, markAllAsRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [items, unread] = await Promise.all([
    listForUser(session.user.id, 30),
    unreadCount(session.user.id),
  ]);
  return NextResponse.json({ items, unread });
}

export async function POST(request: Request) {
  // POST /api/me/notifications  → marcar todas como lidas
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  if (url.searchParams.get("action") === "read-all") {
    await markAllAsRead(session.user.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "bad action" }, { status: 400 });
}
