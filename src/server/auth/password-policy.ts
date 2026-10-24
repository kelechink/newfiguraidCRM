import "server-only";
import { createHash } from "node:crypto";

const COMMON = new Set(["password", "password1", "123456789012", "qwertyuiop12", "figuraid", "figuraid123", "welcome12345", "letmein12345", "iloveyou1234", "nigeria12345", "abuja1234567"]);

/** Strong-password rules (Security #1). Returns a user-facing message or null when acceptable. */
export async function passwordProblem(password: string, email: string): Promise<string | null> {
  if (password.length < 12) return "Use at least 12 characters — a short phrase works well.";
  if (password.length > 128) return "That password is too long.";
  const lower = password.toLowerCase();
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (COMMON.has(lower) || (local.length >= 3 && lower.includes(local))) return "That password is too easy to guess.";
  if (new Set(password).size < 6) return "Use a more varied password.";
  if (await isBreached(password)) return "That password has appeared in a data breach. Please choose another.";
  return null;
}

/**
 * Have I Been Pwned range API (k-anonymity: only the first 5 hex chars of the
 * SHA-1 leave the server). Fails open after 3 s so an outage can't block sign-ups.
 */
export async function isBreached(password: string): Promise<boolean> {
  if (process.env.HIBP_DISABLED === "1") return false;
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const suffix = sha1.slice(5);
    return (await res.text()).split("\n").some((line) => line.startsWith(suffix) && Number(line.split(":")[1]) > 0);
  } catch {
    return false;
  }
}
