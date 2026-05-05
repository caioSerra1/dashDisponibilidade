import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const querySchema = z.object({
  type: z.enum(["server", "app"]),
});

/**
 * DELETE /api/admin/availability/events/[id]?type=server|app
 *
 * Remove um evento (incidente / monitor-gap) marcando-o como falso positivo.
 * Útil pra limpar timeouts isolados que não foram quedas reais.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ type: url.searchParams.get("type") });
  if (!parsed.success) {
    return NextResponse.json({ error: "type=server|app obrigatório" }, { status: 400 });
  }

  if (parsed.data.type === "app") {
    await prisma.webAppEvent.delete({ where: { id } });
  } else {
    await prisma.serverEvent.delete({ where: { id } });
  }
  return NextResponse.json({ ok: true });
}
