import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createSchema = z.object({
  content: z.string().min(1).max(4000),
});

async function requireAdmin() {
  const s = await auth();
  return s?.user?.role === "ADMIN" ? s : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const notes = await prisma.userNote.findMany({
    where: { userId: id },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ notes });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const note = await prisma.userNote.create({
    data: {
      userId: id,
      authorId: session.user!.id,
      content: parsed.data.content,
    },
    include: { author: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ note });
}
