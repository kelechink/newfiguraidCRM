// Field-level encryption (Security #13): AES-256-GCM with versioned keys.
// Ciphertext format: "<keyVersion>:<iv b64url>:<tag b64url>:<data b64url>".
// The newest key (FIELD_ENCRYPTION_ACTIVE) encrypts; any listed key decrypts,
// so keys rotate by adding v2, switching ACTIVE, then re-encrypting at leisure.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type Keyring = { active: string; keys: Map<string, Buffer> };
let cached: Keyring | null = null;

function keyring(): Keyring {
  if (cached) return cached;
  const raw = process.env.FIELD_ENCRYPTION_KEYS ?? "";
  const keys = new Map<string, Buffer>();
  for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [version, b64] = part.split(":");
    const key = Buffer.from(b64 ?? "", "base64");
    if (!version || key.length !== 32) throw new Error(`FIELD_ENCRYPTION_KEYS: key "${version}" must be 32 bytes (base64)`);
    keys.set(version, key);
  }
  const active = process.env.FIELD_ENCRYPTION_ACTIVE ?? [...keys.keys()].at(-1) ?? "";
  if (!keys.has(active)) throw new Error("Field encryption is not configured: set FIELD_ENCRYPTION_KEYS and FIELD_ENCRYPTION_ACTIVE");
  cached = { active, keys };
  return cached;
}

/** For tests that swap keys. */
export function resetKeyringCache() {
  cached = null;
}

export function encrypt(plain: string): string {
  const { active, keys } = keyring();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys.get(active)!, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [active, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(":");
}

export function decrypt(payload: string): string {
  const [version, iv, tag, data] = payload.split(":");
  const key = version ? keyring().keys.get(version) : undefined;
  if (!key || !iv || !tag || data === undefined) throw new Error("Undecryptable field");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export const encryptJson = (value: unknown) => encrypt(JSON.stringify(value));
export const decryptJson = <T>(payload: string): T => JSON.parse(decrypt(payload)) as T;

export function encryptOptional(plain: string | null | undefined): string | null {
  return plain === null || plain === undefined || plain === "" ? null : encrypt(plain);
}

export function decryptOptional(payload: string | null | undefined): string | null {
  return payload ? decrypt(payload) : null;
}

/** "•••• 4821" style masking for display without decrypting into the UI. */
export function maskTail(value: string | null, visible = 4): string {
  if (!value) return "—";
  return `•••• ${value.slice(-visible)}`;
}
