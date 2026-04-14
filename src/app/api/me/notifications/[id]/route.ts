import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markAsRead } from "@/lib/notifications";

export const runtime = "nodejs";

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await markAsRead(session.user.id, id);
  return NextResponse.json({ ok: true });
}
