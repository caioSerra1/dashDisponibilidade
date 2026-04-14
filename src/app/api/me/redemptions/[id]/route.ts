import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { refund } from "@/lib/wallet";
import { broadcastNotification, createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

/**
 * DELETE /api/me/redemptions/[id]
 * Cancela um pedido em status PENDING e estorna as moedas.
 * Apenas o próprio dono pode cancelar.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const r = await prisma.redemption.findUnique({
    where: { id },
    include: { item: true, user: { select: { name: true } } },
  });
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (r.userId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (r.status !== "PENDING") {
    return NextResponse.json(
      { error: "Só é possível cancelar pedidos pendentes." },
      { status: 400 },
    );
  }

  await prisma.redemption.update({
    where: { id },
    data: { status: "REJECTED", note: "Cancelado pelo usuário" },
  });

  await refund({
    userId: r.userId,
    amount: r.priceCoins,
    reason: `redemption:${r.itemId}`,
    refType: "redemption",
    refId: r.id,
  });

  if (r.item.stock !== null) {
    await prisma.storeItem.update({
      where: { id: r.itemId },
      data: { stock: { increment: 1 } },
    });
  }

  // Notificações: usuário e admins
  await createNotification({
    userId: r.userId,
    type: "REDEMPTION",
    title: "Pedido cancelado",
    body: `Você cancelou o resgate de "${r.item.name}" e ${r.priceCoins} moedas foram estornadas.`,
    href: "/loja/minhas-retiradas",
    refType: "redemption",
    refId: r.id,
  });

  // Notifica todos os admins
  const admins = await prisma.user.findMany({
    where: { active: true, role: "ADMIN" },
    select: { id: true },
  });
  if (admins.length > 0) {
    await broadcastNotification({
      type: "REDEMPTION",
      title: "Pedido cancelado pelo usuário",
      body: `${r.user.name} cancelou o resgate de "${r.item.name}".`,
      href: "/admin/loja/pedidos",
      userIds: admins.map((a) => a.id),
    });
  }

  return NextResponse.json({ ok: true });
}
