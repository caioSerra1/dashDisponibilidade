import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await auth();
  if (s?.user?.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const list = await prisma.redemption.findMany({
    include: {
      item: true,
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
  });
  return NextResponse.json({ redemptions: list });
}
