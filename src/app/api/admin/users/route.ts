import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
  clickupUserId: z.string().optional(),
  showInMural: z.boolean().optional(),
});

async function requireAdmin() {
  const session = await auth();
  return session?.user?.role === "ADMIN";
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      clickupUserId: true,
      active: true,
      showInMural: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  // Default: members aparecem no mural, admins não — mas admin pode forçar.
  const showInMural =
    parsed.data.showInMural !== undefined ? parsed.data.showInMural : parsed.data.role === "MEMBER";
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash,
      role: parsed.data.role,
      clickupUserId: parsed.data.clickupUserId || null,
      showInMural,
    },
  });
  // Garante wallet para o novo usuário
  await prisma.wallet.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, coins: 0, lifetime: 0 },
  });
  return NextResponse.json({ user: { id: user.id, email: user.email } });
}
