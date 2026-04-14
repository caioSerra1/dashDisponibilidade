import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { broadcastNotification } from "@/lib/notifications";

export const runtime = "nodejs";

const schema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().max(800).optional(),
  href: z.string().max(500).optional(),
  userIds: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const result = await broadcastNotification(parsed.data);
  return NextResponse.json({ ok: true, ...result });
}
