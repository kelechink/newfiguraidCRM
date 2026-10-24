// Checks applied to exchange rates the AI finds on the web, before any are used.
// The AI only reads public news/market pages; it never sees company data.

export interface FoundRate {
  currency: string;
  buy: number | null;
  sell: number | null;
  source: string;
  url?: string;
  publishedOn?: string;
}

export interface Verdict {
  currency: "USD" | "EUR" | "GBP";
  rate: number | null;
  accepted: boolean;
  reason: string;
  used: FoundRate[];
}

const MIN_SOURCES = 2;
const AGREE_PCT = 3; // sources must agree within 3% of their median
const MAX_JUMP_PCT = 15; // a day-on-day move bigger than this needs a human
const MAX_AGE_DAYS = 3;

/** Pull the JSON object out of a model reply (tolerates ```json fences and prose around it). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1]! : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * Accept a currency's rate only when at least two independent, recent sources agree,
 * and the move from yesterday is plausible. The rate used is the median selling price
 * (what it costs Figuraid to buy that currency).
 */
export function judgeRates(found: FoundRate[], previous: Partial<Record<string, number>>, today: string): Verdict[] {
  return (["USD", "EUR", "GBP"] as const).map((currency) => {
    const fresh = found.filter((f) => {
      if (f.currency !== currency) return false;
      const v = f.sell ?? f.buy;
      if (!v || !Number.isFinite(v) || v < 100 || v > 20_000) return false; // naira per unit, sanity band
      if (f.publishedOn) {
        const age = (Date.parse(today) - Date.parse(f.publishedOn)) / 86_400_000;
        if (!(age >= -1 && age <= MAX_AGE_DAYS)) return false;
      }
      return true;
    });
    const bySource = new Map<string, FoundRate>();
    for (const f of fresh) {
      const key = f.source.trim().toLowerCase();
      if (key && !bySource.has(key)) bySource.set(key, f);
    }
    const used = [...bySource.values()];
    if (used.length < MIN_SOURCES) return { currency, rate: null, accepted: false, reason: `Only ${used.length} recent source${used.length === 1 ? "" : "s"} found`, used };
    const values = used.map((u) => (u.sell ?? u.buy)!);
    const mid = median(values);
    const agreeing = used.filter((u) => Math.abs((u.sell ?? u.buy)! - mid) / mid <= AGREE_PCT / 100);
    if (agreeing.length < MIN_SOURCES) return { currency, rate: null, accepted: false, reason: `Sources disagree (${values.map((v) => `₦${v}`).join(", ")})`, used };
    const rate = Math.round(median(agreeing.map((u) => (u.sell ?? u.buy)!)) * 100) / 100;
    const prev = previous[currency];
    if (prev && Math.abs(rate - prev) / prev > MAX_JUMP_PCT / 100) return { currency, rate, accepted: false, reason: `₦${rate} is more than ${MAX_JUMP_PCT}% from yesterday's ₦${prev}`, used: agreeing };
    return { currency, rate, accepted: true, reason: `${agreeing.length} sources agree`, used: agreeing };
  });
}
