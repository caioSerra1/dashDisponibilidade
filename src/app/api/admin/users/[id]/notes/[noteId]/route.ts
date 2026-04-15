import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const patchSchema = z.object({
  content: z.string().min(1).max(4000),
});

async function requireAdmin() {
  const s = await auth();
  return s?.user?.role === "ADMIN";
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id, noteId } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const note = await prisma.userNote.update({
    where: { id: noteId, userId: id },
    data: { content: parsed.data.content },
  });
  return NextResponse.json({ note });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id, noteId } = await params;
  await prisma.userNote.delete({ where: { id: noteId, userId: id } });
  return NextResponse.json({ ok: true });
}
