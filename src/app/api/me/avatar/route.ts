import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveAvatar, UploadError } from "@/lib/upload";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo ausente" }, { status: 400 });
    }
    const relPath = await saveAvatar(session.user.id, file);
    await prisma.user.update({
      where: { id: session.user.id },
      data: { avatarPath: relPath },
    });
    return NextResponse.json({ ok: true, path: relPath });
  } catch (e) {
    if (e instanceof UploadError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
