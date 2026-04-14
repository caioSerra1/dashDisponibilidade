import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { debit, InsufficientFundsError } from "@/lib/wallet";

export const runtime = "nodejs";

const schema = z.object({ itemId: z.string().min(1) });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const item = await prisma.storeItem.findUnique({ where: { id: parsed.data.itemId } });
  if (!item || !item.active) {
    return NextResponse.json({ error: "Item indisponível" }, { status: 404 });
  }
  if (item.stock !== null && item.stock <= 0) {
    return NextResponse.json({ error: "Sem estoque" }, { status: 400 });
  }

  try {
    const redemption = await prisma.$transaction(async (tx) => {
      // Cria pedido primeiro (estado PENDING)
      const r = await tx.redemption.create({
        data: {
          userId: session.user.id,
          itemId: item.id,
          priceCoins: item.priceCoins,
          status: "PENDING",
        },
      });
      // Decrementa estoque (se controlado)
      if (item.stock !== null) {
        await tx.storeItem.update({
          where: { id: item.id },
          data: { stock: { decrement: 1 } },
        });
      }
      return r;
    });

    // Débito fora da transação principal pra reaproveitar wallet.debit
    try {
      await debit({
        userId: session.user.id,
        amount: item.priceCoins,
        reason: `redeem:${item.name}`,
        refType: "redemption",
        refId: redemption.id,
      });
    } catch (err) {
      // Se falhou o débito, reverte o pedido + estoque
      await prisma.$transaction(async (tx) => {
        await tx.redemption.delete({ where: { id: redemption.id } });
        if (item.stock !== null) {
          await tx.storeItem.update({
            where: { id: item.id },
            data: { stock: { increment: 1 } },
          });
        }
      });
      if (err instanceof InsufficientFundsError) {
        return NextResponse.json({ error: "Saldo insuficiente" }, { status: 400 });
      }
      throw err;
    }

    return NextResponse.json({ ok: true, redemptionId: redemption.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
