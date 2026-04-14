import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  profileBio: z.string().max(280).nullable().optional(),
  password: z.string().min(6).max(120).optional(),
  currentPassword: z.string().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      profileBio: true,
      avatarPath: true,
      clickupUserId: true,
    },
  });
  return NextResponse.json({ user });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  if (parsed.data.name) data.name = parsed.data.name;
  if (parsed.data.profileBio !== undefined) data.profileBio = parsed.data.profileBio;
  if (parsed.data.password) {
    if (!parsed.data.currentPassword) {
      return NextResponse.json({ error: "Senha atual obrigatória" }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });
    const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!ok) return NextResponse.json({ error: "Senha atual incorreta" }, { status: 400 });
    data.passwordHash = await bcrypt.hash(parsed.data.password, 10);
  }
  await prisma.user.update({ where: { id: session.user.id }, data });
  return NextResponse.json({ ok: true });
}
