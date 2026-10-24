import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Opaque URL-safe token for links (invites, resets, signing, CSAT). Store only its hash. */
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET is not set");
  return s;
}

/** HMAC signature for short-lived signed URLs (file downloads). */
export function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function verifySignature(value: string, signature: string): boolean {
  const expected = Buffer.from(sign(value));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
