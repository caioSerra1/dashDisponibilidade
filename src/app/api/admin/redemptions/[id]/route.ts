import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { refund } from "@/lib/wallet";
import { createNotification } from "@/lib/notifications";

const ACTIONS = ["APPROVE", "DELIVER", "REJECT"] as const;
const schema = z.object({
  action: z.enum(ACTIONS),
  note: z.string().max(280).optional(),
});

async function requireAdmin() {
  const s = await auth();
  return s?.user?.role === "ADMIN";
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const r = await prisma.redemption.findUnique({ where: { id }, include: { item: true } });
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });

  switch (parsed.data.action) {
    case "APPROVE": {
      if (r.status !== "PENDING") return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
      await prisma.redemption.update({
        where: { id },
        data: { status: "APPROVED", approvedAt: new Date(), note: parsed.data.note ?? r.note },
      });
      await createNotification({
        userId: r.userId,
        type: "REDEMPTION",
        title: "Pedido aprovado ✅",
        body: `Seu resgate de "${r.item.name}" foi aprovado e está pronto pra entrega.`,
        href: "/loja/minhas-retiradas",
        refType: "redemption",
        refId: r.id,
      });
      return NextResponse.json({ ok: true });
    }

    case "DELIVER": {
      if (r.status !== "APPROVED" && r.status !== "PENDING")
        return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
      await prisma.redemption.update({
        where: { id },
        data: {
          status: "DELIVERED",
          deliveredAt: new Date(),
          approvedAt: r.approvedAt ?? new Date(),
          note: parsed.data.note ?? r.note,
        },
      });
      await createNotification({
        userId: r.userId,
        type: "REDEMPTION",
        title: "Pedido entregue 🎁",
        body: `Você recebeu "${r.item.name}". Aproveite!`,
        href: "/loja/minhas-retiradas",
        refType: "redemption",
        refId: r.id,
      });
      return NextResponse.json({ ok: true });
    }

    case "REJECT": {
      if (r.status === "DELIVERED" || r.status === "REJECTED")
        return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
      await prisma.redemption.update({
        where: { id },
        data: { status: "REJECTED", note: parsed.data.note ?? r.note },
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
      await createNotification({
        userId: r.userId,
        type: "REDEMPTION",
        title: "Pedido recusado",
        body: `Seu resgate de "${r.item.name}" foi recusado e ${r.priceCoins} moedas foram devolvidas.${parsed.data.note ? ` Motivo: ${parsed.data.note}` : ""}`,
        href: "/loja/minhas-retiradas",
        refType: "redemption",
        refId: r.id,
      });
      return NextResponse.json({ ok: true });
    }
  }
}
