// Telecom wholesale maths: billing increments, rating, margin, cycles, decks and CDRs.
// Pure functions only — the services persist the results.

export const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10_000) / 10_000;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Billable seconds for one call under an increment like 60/60, 30/30 or 1/1:
 * the first block is charged in full, then each started `next` block.
 */
export function billSeconds(duration: number, first: number, next: number): number {
  if (!(duration > 0)) return 0;
  if (first < 1 || next < 1) throw new Error("Increments must be at least 1 second");
  if (duration <= first) return first;
  return first + Math.ceil((duration - first) / next) * next;
}

/**
 * Billed minutes for aggregated traffic (switch summaries give total seconds and calls).
 * Without per-call durations we apply the increment to the average call — exact for 1/1,
 * a close estimate otherwise. CDR imports bill each call exactly.
 */
export function billedMinutesAggregate(rawSeconds: number, calls: number | null | undefined, first: number, next: number): number {
  if (rawSeconds <= 0) return 0;
  if (!calls || calls <= 0) return round4(billSeconds(rawSeconds, first, next) / 60);
  const avg = rawSeconds / calls;
  return round4((calls * billSeconds(avg, first, next)) / 60);
}

export interface RateRow {
  id: string;
  ratePerMin: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/** The rate in force at `at` (effectiveFrom ≤ at < effectiveTo). Latest start wins on overlap. */
export function rateAt<T extends RateRow>(rates: T[], at: Date): T | null {
  const t = at.getTime();
  let best: T | null = null;
  for (const r of rates) {
    if (r.effectiveFrom.getTime() <= t && (!r.effectiveTo || r.effectiveTo.getTime() > t)) {
      if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
    }
  }
  return best;
}

export interface Rated {
  cost: number;
  revenue: number;
  margin: number;
  marginPct: number | null;
}

export function rate(vendorMinutes: number, buyRate: number, customerMinutes: number, sellRate: number): Rated {
  const cost = round4(vendorMinutes * buyRate);
  const revenue = round4(customerMinutes * sellRate);
  return marginOf(revenue, cost);
}

export function marginOf(revenue: number, cost: number): Rated {
  const margin = round4(revenue - cost);
  return { cost, revenue, margin, marginPct: revenue > 0 ? round2((margin / revenue) * 100) : null };
}

export type MarginAlert = "negative" | "thin" | null;
/** Negative margin always alerts; thin margin alerts under the configured threshold (default 2%). */
export function marginAlert(m: Pick<Rated, "margin" | "marginPct">, thresholdPct: number): MarginAlert {
  if (m.margin < 0) return "negative";
  if (m.marginPct != null && m.marginPct < thresholdPct) return "thin";
  return null;
}

/** ASR (answer-seizure ratio, %) and ACD (average call duration, minutes). */
export function asrAcd(calls: number | null, connected: number | null, rawSeconds: number) {
  const asr = calls && connected != null ? round2((connected / calls) * 100) : null;
  const acd = connected ? round2(rawSeconds / 60 / connected) : null;
  return { asr, acd };
}

// ── billing cycles ("7/3" = 7-day cycle, payment due 3 days after it closes) ──

const DAY = 86_400_000;
const utcMidnight = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** The cycle containing `at`, counted from the anchor day. End is exclusive. */
export function cycleFor(anchor: Date, cycleDays: number, at: Date): { start: Date; end: Date } {
  if (cycleDays < 1) throw new Error("Cycle must be at least one day");
  const a = utcMidnight(anchor);
  const n = Math.floor((utcMidnight(at) - a) / (cycleDays * DAY));
  const start = a + n * cycleDays * DAY;
  return { start: new Date(start), end: new Date(start + cycleDays * DAY) };
}

/** The most recent fully closed cycle before `now`. */
export function lastClosedCycle(anchor: Date, cycleDays: number, now: Date) {
  const current = cycleFor(anchor, cycleDays, now);
  return { start: new Date(current.start.getTime() - cycleDays * DAY), end: current.start };
}

export const dueDateFor = (cycleEnd: Date, termDays: number) => new Date(cycleEnd.getTime() + termDays * DAY);

/** "7/3", "15/5", "30/7" labels for the UI. */
export const termsLabel = (cycleDays: number, termDays: number) => `${cycleDays}/${termDays}`;
export const incrementLabel = (first: number, next: number) => `${first}/${next}`;

// ── credit & prepaid ──

export type CreditState = "ok" | "warning" | "over";
/** Postpaid customer exposure vs limit: warn at 80%, over at 100%. */
export function creditState(exposure: number, limit: number | null): CreditState {
  if (!limit || limit <= 0) return "ok";
  if (exposure >= limit) return "over";
  if (exposure >= limit * 0.8) return "warning";
  return "ok";
}

// ── route matching ──

/** Longest-prefix match of a dialled number against route prefixes. */
export function matchPrefix<T extends { prefix: string }>(number: string, routes: T[]): T | null {
  const digits = number.replace(/\D/g, "").replace(/^00/, "");
  let best: T | null = null;
  for (const r of routes) if (digits.startsWith(r.prefix) && (!best || r.prefix.length > best.prefix.length)) best = r;
  return best;
}

// ── CSV ──

/** Minimal RFC 4180 parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

const header = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function columns(head: string[], wanted: Record<string, string[]>) {
  const idx: Record<string, number> = {};
  const norm = head.map(header);
  for (const [key, aliases] of Object.entries(wanted)) idx[key] = norm.findIndex((h) => aliases.includes(h));
  return idx;
}

export interface DeckRow {
  line: number;
  prefix: string;
  destination: string;
  ratePerMin: number;
  effectiveFrom: Date | null;
}

/** Parse a rate deck. Columns (any order, common aliases): prefix, destination, rate, effective date. */
export function parseRateDeck(text: string): { rows: DeckRow[]; errors: { line: number; message: string }[] } {
  const [head, ...body] = parseCsv(text);
  if (!head) return { rows: [], errors: [{ line: 1, message: "The file is empty" }] };
  const c = columns(head, {
    prefix: ["prefix", "code", "dial_code", "dialcode", "codes"],
    destination: ["destination", "country", "description", "name", "dest"],
    rate: ["rate", "price", "rate_per_min", "rate_min", "usd_min", "per_minute"],
    effective: ["effective", "effective_date", "effective_from", "date", "valid_from"],
  });
  const missing = (["prefix", "rate"] as const).filter((k) => c[k]! < 0);
  if (missing.length) return { rows: [], errors: [{ line: 1, message: `Missing column: ${missing.join(", ")}` }] };
  const rows: DeckRow[] = [];
  const errors: { line: number; message: string }[] = [];
  const seen = new Set<string>();
  body.forEach((r, i) => {
    const line = i + 2;
    const prefix = (r[c.prefix!] ?? "").replace(/\D/g, "");
    const rateStr = (r[c.rate!] ?? "").replace(/[^0-9.]/g, "");
    const ratePerMin = Number(rateStr);
    if (!prefix) return errors.push({ line, message: "No prefix" });
    if (!rateStr || !Number.isFinite(ratePerMin) || ratePerMin < 0 || ratePerMin > 100) return errors.push({ line, message: `Bad rate "${r[c.rate!] ?? ""}"` });
    if (seen.has(prefix)) return errors.push({ line, message: `Duplicate prefix ${prefix}` });
    seen.add(prefix);
    let effectiveFrom: Date | null = null;
    const eff = c.effective! >= 0 ? (r[c.effective!] ?? "").trim() : "";
    if (eff) {
      const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(eff) ? `${eff}T00:00:00Z` : eff);
      if (Number.isNaN(d.getTime())) return errors.push({ line, message: `Bad date "${eff}"` });
      effectiveFrom = d;
    }
    rows.push({ line, prefix, destination: c.destination! >= 0 ? (r[c.destination!] ?? "").trim() : "", ratePerMin, effectiveFrom });
  });
  return { rows, errors };
}

export interface CdrRow {
  line: number;
  startedAt: Date;
  dialled: string;
  seconds: number;
}

/** Parse CDRs. Columns: start time, dialled/B-number, duration in seconds. */
export function parseCdr(text: string): { rows: CdrRow[]; errors: { line: number; message: string }[] } {
  const [head, ...body] = parseCsv(text);
  if (!head) return { rows: [], errors: [{ line: 1, message: "The file is empty" }] };
  const c = columns(head, {
    start: ["start", "start_time", "starttime", "call_start", "date", "datetime", "connect_time", "setup_time"],
    dialled: ["b_number", "bnumber", "called", "called_number", "dialled", "dialed", "destination_number", "cld", "dst"],
    seconds: ["duration", "seconds", "duration_seconds", "billsec", "bill_sec", "duration_s"],
  });
  const missing = (["start", "dialled", "seconds"] as const).filter((k) => c[k]! < 0);
  if (missing.length) return { rows: [], errors: [{ line: 1, message: `Missing column: ${missing.join(", ")}` }] };
  const rows: CdrRow[] = [];
  const errors: { line: number; message: string }[] = [];
  body.forEach((r, i) => {
    const line = i + 2;
    const startedAt = new Date((r[c.start!] ?? "").trim());
    const seconds = Number((r[c.seconds!] ?? "").trim());
    const dialled = (r[c.dialled!] ?? "").replace(/\D/g, "");
    if (Number.isNaN(startedAt.getTime())) return errors.push({ line, message: "Bad start time" });
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86_400) return errors.push({ line, message: "Bad duration" });
    if (dialled.length < 5) return errors.push({ line, message: "Bad dialled number" });
    rows.push({ line, startedAt, dialled, seconds: Math.round(seconds) });
  });
  return { rows, errors };
}

/** CSV-safe cell (quotes and formula-injection guard). */
export function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\r\n]|^[=+\-@\t\r]/.test(s) ? `"${s.replace(/"/g, '""').replace(/^[=+\-@\t\r]/, "'$&")}"` : s;
}
