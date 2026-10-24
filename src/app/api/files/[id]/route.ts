import { NextResponse, type NextRequest } from "next/server";
import { getCtx } from "@/server/auth/session";
import { checkFileSignature, readFile } from "@/server/files/upload";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  const exp = Number(req.nextUrl.searchParams.get("e"));
  const sig = req.nextUrl.searchParams.get("s") ?? "";
  if (!ctx || !checkFileSignature(id, ctx.userId, exp, sig)) return new NextResponse("Link expired", { status: 403 });
  const file = await readFile(id);
  if (!file) return new NextResponse("Not found", { status: 404 });
  const inline = file.row.mimeType.startsWith("image/") || file.row.mimeType === "application/pdf" || file.row.mimeType.startsWith("audio/");
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "content-type": file.row.mimeType,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${file.row.filename}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
