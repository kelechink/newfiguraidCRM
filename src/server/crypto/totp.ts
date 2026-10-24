// RFC 6238 TOTP (SHA-1, 30 s, 6 digits) — what Google Authenticator, 1Password and Authy use.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_S = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function counterAt(time = Date.now()): number {
  return Math.floor(time / 1000 / STEP_S);
}

export function totpCode(secret: string, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const bin = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(bin).padStart(6, "0");
}

/**
 * Verify with ±1 step clock drift. Returns the matched counter so the caller can
 * store it and reject the same code (or an older one) next time — replay protection.
 */
export function verifyTotp(secret: string, code: string, lastCounter: number | null, time = Date.now()): number | null {
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const now = counterAt(time);
  for (const c of [now - 1, now, now + 1]) {
    if (lastCounter !== null && c <= lastCounter) continue;
    const expected = Buffer.from(totpCode(secret, c));
    if (timingSafeEqual(expected, Buffer.from(clean))) return c;
  }
  return null;
}

export function otpauthUri(secret: string, account: string, issuer = "Figuraid OS"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_S}`;
}

/** Ten single-use recovery codes, e.g. "7KQ2-M9XD". */
export function newRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const s = base32Encode(randomBytes(5)).slice(0, 8);
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}
