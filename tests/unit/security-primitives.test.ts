import { describe, expect, it } from "vitest";
import { decrypt, decryptJson, encrypt, encryptJson, resetKeyringCache } from "@/server/crypto/field";
import { base32Decode, base32Encode, counterAt, totpCode, verifyTotp } from "@/server/crypto/totp";
import { sign, verifySignature } from "@/server/crypto/tokens";

describe("field encryption", () => {
  it("round-trips and never produces the same ciphertext twice", () => {
    const a = encrypt("₦450,000");
    const b = encrypt("₦450,000");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1:")).toBe(true);
    expect(decrypt(a)).toBe("₦450,000");
    expect(decryptJson(encryptJson({ bank: "GTBank", account: "0123456789" }))).toEqual({ bank: "GTBank", account: "0123456789" });
  });

  it("detects tampering", () => {
    const parts = encrypt("salary").split(":");
    parts[3] = Buffer.from("SALARY").toString("base64url");
    expect(() => decrypt(parts.join(":"))).toThrow();
  });

  it("decrypts old-key data after rotation", () => {
    const old = encrypt("bank details");
    const before = { keys: process.env.FIELD_ENCRYPTION_KEYS, active: process.env.FIELD_ENCRYPTION_ACTIVE };
    process.env.FIELD_ENCRYPTION_KEYS = `${before.keys},v2:${Buffer.alloc(32, 9).toString("base64")}`;
    process.env.FIELD_ENCRYPTION_ACTIVE = "v2";
    resetKeyringCache();
    try {
      expect(decrypt(old)).toBe("bank details");
      expect(encrypt("x").startsWith("v2:")).toBe(true);
    } finally {
      process.env.FIELD_ENCRYPTION_KEYS = before.keys;
      process.env.FIELD_ENCRYPTION_ACTIVE = before.active;
      resetKeyringCache();
    }
  });
});

describe("TOTP", () => {
  // RFC 6238 appendix B seed "12345678901234567890"
  const secret = base32Encode(Buffer.from("12345678901234567890"));

  it("matches the RFC test vectors", () => {
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
    expect(totpCode(secret, counterAt(59_000))).toBe("287082");
    expect(totpCode(secret, counterAt(1_111_111_109_000))).toBe("081804");
  });

  it("accepts ±1 step of drift and rejects reuse", () => {
    const t = 1_700_000_000_000;
    const code = totpCode(secret, counterAt(t));
    const used = verifyTotp(secret, code, null, t + 25_000);
    expect(used).toBe(counterAt(t));
    expect(verifyTotp(secret, code, used, t + 25_000)).toBeNull(); // replay
    expect(verifyTotp(secret, code, null, t + 120_000)).toBeNull(); // too old
    expect(verifyTotp(secret, "12345", null, t)).toBeNull();
  });
});

describe("signed URLs", () => {
  it("verifies only the exact value", () => {
    const s = sign("file:abc:1700000000");
    expect(verifySignature("file:abc:1700000000", s)).toBe(true);
    expect(verifySignature("file:abd:1700000000", s)).toBe(false);
    expect(verifySignature("file:abc:1700000000", s.slice(0, -1) + "A")).toBe(false);
  });
});
