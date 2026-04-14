import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const list = await prisma.redemption.findMany({
    where: { userId: session.user.id },
    include: { item: true },
    orderBy: { requestedAt: "desc" },
    take: 30,
  });
  return NextResponse.json({
    redemptions: list.map((r) => ({
      id: r.id,
      status: r.status,
      priceCoins: r.priceCoins,
      requestedAt: r.requestedAt,
      approvedAt: r.approvedAt,
      deliveredAt: r.deliveredAt,
      note: r.note,
      item: {
        id: r.item.id,
        name: r.item.name,
        imageUrl: r.item.imageUrl,
      },
    })),
  });
}
