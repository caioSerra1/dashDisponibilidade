import { NextResponse } from "next/server";
import { findImage } from "@/lib/upload";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await findImage("produtos", id);
  if (!result) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": result.mime,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
