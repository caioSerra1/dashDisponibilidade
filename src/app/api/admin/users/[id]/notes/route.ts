import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createSchema = z.object({
  content: z.string().min(1).max(4000),
});

/**
 * Exige que a sessão seja admin e retorna `{ adminId }` pronto pra usar.
 * Retorna null quando não autenticado, não-admin ou sem id.
 */
async function requireAdmin(): Promise<{ adminId: string } | null> {
  const s = await auth();
  if (!s?.user?.id || s.user.role !== "ADMIN") return null;
  return { adminId: s.user.id };
}

async function assertUserExists(id: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });
  return u != null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await assertUserExists(id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
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
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  if (!(await assertUserExists(id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const note = await prisma.userNote.create({
    data: {
      userId: id,
      authorId: admin.adminId,
      content: parsed.data.content,
    },
    include: { author: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ note });
}
