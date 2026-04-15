import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveImage, UploadError } from "@/lib/upload";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const item = await prisma.storeItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  const fd = await request.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "arquivo ausente" }, { status: 400 });
  }

  try {
    await saveImage("produtos", id, file);
  } catch (e) {
    if (e instanceof UploadError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  // Cache-busting via ?v=timestamp pra forçar reload da imagem no browser
  const imageUrl = `/api/store-images/${id}?v=${Date.now()}`;
  await prisma.storeItem.update({ where: { id }, data: { imageUrl } });

  return NextResponse.json({ ok: true, imageUrl });
}
