import "server-only";
import type { Ctx } from "@/server/authz/context";

export interface SearchHit {
  id: string;
  kind: string; // "Task", "Contact", "Invoice", …
  title: string;
  subtitle?: string;
  href: string;
}

type Provider = (ctx: Ctx, q: string) => Promise<SearchHit[]>;
const providers: Provider[] = [];

/** Modules register a scoped search provider; each applies its own permission scope. */
export function registerSearch(p: Provider) {
  providers.push(p);
}

export async function globalSearch(ctx: Ctx, q: string): Promise<SearchHit[]> {
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return [];
  await import("./providers");
  const results = await Promise.allSettled(providers.map((p) => p(ctx, term)));
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])).slice(0, 40);
}
