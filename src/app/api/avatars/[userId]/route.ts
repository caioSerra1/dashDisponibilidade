import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readAvatar } from "@/lib/upload";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarPath: true },
  });
  if (!user?.avatarPath) {
    return NextResponse.json({ error: "no avatar" }, { status: 404 });
  }
  const file = await readAvatar(user.avatarPath);
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(file.buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "private, max-age=300",
    },
  });
}
