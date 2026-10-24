import "server-only";
import type { Currency } from "@prisma/client";
import { z } from "zod";
import { round2 } from "@/domain/finance/money";
import { audit } from "@/server/audit/audit";
import { can, type Ctx } from "@/server/authz/context";
import { ForbiddenError, RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";

// One source of truth for "what is this worth in naira today". Rates are numbers
// from a rates feed or typed in by Finance — never estimated by the AI assistant,
// because every converted figure must be exact and traceable.

export const CURRENCIES = ["NGN", "USD", "EUR", "GBP"] as const;
export type Rates = Record<Currency, number>;
export interface RateInfo { currency: Currency; rate: number; source: string; asOf: string | null; stale: boolean }

/** Used only until Finance enters a first rate; shown as stale everywhere. */
const FALLBACK: Rates = { NGN: 1, USD: 1550, EUR: 1680, GBP: 1960 };
const STALE_DAYS = 7;
const MAX_JUMP = 0.25; // feed values moving >25% in a day are held for a human

export async function rateInfo(): Promise<RateInfo[]> {
  const out: RateInfo[] = [];
  for (const c of CURRENCIES) {
    if (c === "NGN") continue;
    const r = await db.fxRate.findFirst({ where: { currency: c }, orderBy: { asOf: "desc" } });
    out.push({ currency: c, rate: r ? Number(r.rateToNgn) : FALLBACK[c], source: r?.source ?? "default", asOf: r?.asOf.toISOString() ?? null, stale: !r || Date.now() - r.asOf.getTime() > STALE_DAYS * 86_400_000 });
  }
  return out;
}

export async function currentRates(): Promise<Rates> {
  const info = await rateInfo();
  return { NGN: 1, ...Object.fromEntries(info.map((i) => [i.currency, i.rate])) } as Rates;
}

/** Naira equivalent at a given rate table. */
export const ngn = (amount: number, currency: string, rates: Rates) => round2(amount * (rates[currency as Currency] ?? NaN));

export async function rateFor(currency: string): Promise<number> {
  return (await currentRates())[currency as Currency];
}

export async function setRate(ctx: Ctx, raw: unknown) {
  const { currency, rate } = z.object({ currency: z.enum(["USD", "EUR", "GBP"]), rate: z.coerce.number().positive().max(1_000_000) }).parse(raw);
  if (!can(ctx, "finance.income", "EDIT") && !can(ctx, "settings", "EDIT")) throw new ForbiddenError("finance.income:EDIT");
  const prev = await db.fxRate.findFirst({ where: { currency }, orderBy: { asOf: "desc" } });
  await db.$transaction(async (tx) => {
    const r = await tx.fxRate.create({ data: { currency, rateToNgn: rate, source: "manual", setById: ctx.userId } });
    await audit(tx, { actorId: ctx.userId, action: "fx.set", entityType: "FxRate", entityId: r.id, before: prev ? { rate: Number(prev.rateToNgn) } : undefined, after: { currency, rate } });
  });
}

/**
 * Daily job: pull rates from FX_API_URL (any JSON feed of `{ rates: { USD: <per NGN> ... } }`
 * based on NGN, e.g. open.er-api.com/v6/latest/NGN). Big jumps are skipped and reported.
 */
export async function refreshRatesFromFeed(): Promise<{ updated: Currency[]; skipped: string[] }> {
  const url = process.env.FX_API_URL;
  if (!url) return { updated: [], skipped: ["FX_API_URL not set"] };
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`FX feed returned ${res.status}`);
  const body = (await res.json()) as { rates?: Record<string, number> };
  const updated: Currency[] = [];
  const skipped: string[] = [];
  for (const c of ["USD", "EUR", "GBP"] as const) {
    const perNgn = body.rates?.[c];
    if (!perNgn || !(perNgn > 0)) { skipped.push(`${c}: missing`); continue; }
    const rate = Math.round((1 / perNgn) * 1e6) / 1e6;
    const prev = await db.fxRate.findFirst({ where: { currency: c }, orderBy: { asOf: "desc" } });
    if (prev && Math.abs(rate - Number(prev.rateToNgn)) / Number(prev.rateToNgn) > MAX_JUMP) { skipped.push(`${c}: ${rate} is more than 25% from ${Number(prev.rateToNgn)}`); continue; }
    await db.$transaction(async (tx) => {
      const r = await tx.fxRate.create({ data: { currency: c, rateToNgn: rate, source: "api" } });
      await audit(tx, { actorId: null, actorType: "system", action: "fx.feed", entityType: "FxRate", entityId: r.id, after: { currency: c, rate } });
    });
    updated.push(c);
  }
  if (skipped.length) {
    const { notify } = await import("@/server/notify/notify");
    const finance = await db.user.findMany({ where: { status: "ACTIVE", role: { key: "finance" } }, select: { id: true } });
    await notify({ userIds: finance.map((f) => f.id), type: "fx.skipped", title: "Exchange rates need a look", body: skipped.join("; "), link: "/money/rates" });
  }
  return { updated, skipped };
}

export function assertRate(rates: Rates, currency: string) {
  if (!(rates[currency as Currency] > 0)) throw new RuleError(`No exchange rate for ${currency}`);
}
