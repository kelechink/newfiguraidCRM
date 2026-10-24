import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { RuleError } from "@/server/authz/errors";
import { sign, verifySignature } from "@/server/crypto/tokens";
import { db } from "@/server/db";
import { scanBytes } from "./scan";
import { storage } from "./storage";

type Kind = "jpeg" | "png" | "webp" | "pdf" | "zip" | "webm" | "ogg" | "mp4" | "text";

/** What each upload purpose accepts (Security #11: type + size allow-list). */
export const PURPOSES = {
  selfie: { kinds: ["jpeg", "png", "webp"], maxMb: 3 },
  avatar: { kinds: ["jpeg", "png", "webp"], maxMb: 2 },
  receipt: { kinds: ["jpeg", "png", "webp", "pdf"], maxMb: 10 },
  cdr: { kinds: ["text"], maxMb: 25 },
  ratedeck: { kinds: ["text"], maxMb: 10 },
  document: { kinds: ["pdf", "jpeg", "png", "zip"], maxMb: 20 },
  attachment: { kinds: ["pdf", "jpeg", "png", "webp", "zip", "text"], maxMb: 15 },
  voice: { kinds: ["webm", "ogg", "mp4"], maxMb: 10 },
  generated: { kinds: ["pdf"], maxMb: 20 },
} as const satisfies Record<string, { kinds: readonly Kind[]; maxMb: number }>;
export type Purpose = keyof typeof PURPOSES;

const MIME: Record<Kind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  zip: "application/zip",
  webm: "audio/webm",
  ogg: "audio/ogg",
  mp4: "audio/mp4",
  text: "text/csv",
};

/** Identify a file by its first bytes, never by the name or the browser's claim. */
export function sniff(bytes: Buffer): Kind | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (b.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return "zip";
  if (b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "webm";
  if (b.subarray(0, 4).toString("latin1") === "OggS") return "ogg";
  if (b.subarray(4, 8).toString("latin1") === "ftyp") return "mp4";
  const head = b.subarray(0, 4096);
  if (!head.includes(0) && Buffer.from(head.toString("utf8"), "utf8").equals(head)) return "text";
  return null;
}

export interface Stored {
  id: string;
  sha256: string;
  kind: Kind;
}

export async function storeFile(input: { bytes: Buffer; filename: string; purpose: Purpose; userId: string | null }): Promise<Stored> {
  const rule = PURPOSES[input.purpose];
  if (input.bytes.length === 0) throw new RuleError("That file is empty");
  if (input.bytes.length > rule.maxMb * 1024 * 1024) throw new RuleError(`Files must be under ${rule.maxMb} MB`);
  const kind = sniff(input.bytes);
  if (!kind || !(rule.kinds as readonly Kind[]).includes(kind)) throw new RuleError("That file type isn't allowed here");
  if (process.env.NODE_ENV === "production" && !process.env.CLAMAV_HOST) throw new Error("CLAMAV_HOST must be set in production");

  const verdict = await scanBytes(input.bytes);
  if (verdict === "INFECTED") throw new RuleError("That file was blocked by the virus scanner");

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const key = `${input.purpose}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}`;
  await storage().put(key, input.bytes, MIME[kind]);
  const safeName = input.filename.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
  const row = await db.fileObject.create({
    data: {
      storageKey: key,
      filename: safeName,
      mimeType: MIME[kind],
      sizeBytes: input.bytes.length,
      sha256,
      purpose: input.purpose,
      scanStatus: verdict === "FAILED" ? "FAILED" : "CLEAN",
      uploadedById: input.userId,
    },
  });
  return { id: row.id, sha256, kind };
}

export async function fileFromForm(form: FormData, field: string): Promise<{ bytes: Buffer; filename: string } | null> {
  const f = form.get(field);
  if (!f || typeof f === "string" || f.size === 0) return null;
  return { bytes: Buffer.from(await f.arrayBuffer()), filename: f.name };
}

/**
 * Short-lived download link, bound to the viewer. Only issue one after the
 * calling service has checked the viewer may see the file.
 */
export function signedFileUrl(fileId: string, viewerId: string, ttlSeconds = 300): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `/api/files/${fileId}?e=${exp}&s=${sign(`${fileId}:${exp}:${viewerId}`)}`;
}

export function checkFileSignature(fileId: string, viewerId: string, exp: number, sig: string): boolean {
  return exp >= Math.floor(Date.now() / 1000) && verifySignature(`${fileId}:${exp}:${viewerId}`, sig);
}

export async function readFile(fileId: string) {
  const row = await db.fileObject.findUnique({ where: { id: fileId } });
  if (!row || row.scanStatus === "INFECTED") return null;
  return { row, bytes: await storage().get(row.storageKey) };
}
