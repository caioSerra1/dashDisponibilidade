import { NextResponse } from "next/server";
import { findImage } from "@/lib/upload";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const row = await prisma.config.findUnique({ where: { key: "logoUpdatedAt" } });
  if (!row) {
    return NextResponse.json({ error: "no custom logo" }, { status: 404 });
  }
  const result = await findImage("logo", "main");
  if (!result) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": result.mime,
      "Cache-Control": "public, max-age=300",
    },
  });
}
