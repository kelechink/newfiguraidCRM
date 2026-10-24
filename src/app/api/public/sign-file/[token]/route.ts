import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "@/server/files/upload";
import { rateLimit, requestIp } from "@/server/ratelimit";
import { fileForSignatureToken } from "@/server/modules/vault/service";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!rateLimit(`sign-file:${await requestIp()}`, 30, 15 * 60_000)) return new NextResponse("Too many requests", { status: 429 });
  const fileId = await fileForSignatureToken((await params).token);
  const file = fileId ? await readFile(fileId) : null;
  if (!file) return new NextResponse("This link has expired", { status: 404 });
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "content-type": file.row.mimeType,
      "content-disposition": `inline; filename="${file.row.filename}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
