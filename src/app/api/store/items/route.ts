import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const items = await prisma.storeItem.findMany({
    where: { active: true },
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ items });
}
