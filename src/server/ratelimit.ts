import "server-only";
import { headers } from "next/headers";

// Fixed-window limiter for public endpoints (Security #16). In-process, which suits
// the single web process; Cloudflare rate limiting sits in front in production.
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    if (hits.size > 50_000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
    return true;
  }
  entry.count++;
  return entry.count <= limit;
}

export async function requestIp(): Promise<string> {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
}

export async function requestUserAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}
