import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureWallet } from "@/lib/wallet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await ensureWallet(session.user.id);
  const [wallet, txns] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId: session.user.id } }),
    prisma.coinTxn.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  return NextResponse.json({
    coins: wallet?.coins ?? 0,
    lifetime: wallet?.lifetime ?? 0,
    txns: txns.map((t) => ({
      id: t.id,
      delta: t.delta,
      reason: t.reason,
      refType: t.refType,
      refId: t.refId,
      createdAt: t.createdAt,
    })),
  });
}
