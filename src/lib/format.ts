// Client-safe formatting. All dates render in Lagos time regardless of the device's zone.

const TZ = "Africa/Lagos";

function dayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function formatTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
}

export function formatDay(d: Date | string, opts: { weekday?: boolean } = {}): string {
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d) : d;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    ...(opts.weekday ? { weekday: "short" } : {}),
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return [opts.weekday ? get("weekday") : "", get("day"), get("month")].filter(Boolean).join(" "); // "Thu 22 Oct"
}

export type DueTone = "overdue" | "today" | "soon" | "later";

/** "Overdue · Mon 19 Oct", "Today 17:00", "Tomorrow", "Thu 29 Oct". */
export function describeDue(iso: string, now = new Date()): { label: string; tone: DueTone } {
  const due = new Date(iso);
  const diff = daysBetween(dayKey(now), dayKey(due));
  if (due < now && diff < 0) return { label: `Overdue · ${formatDay(due, { weekday: true })}`, tone: "overdue" };
  if (diff === 0) return { label: `${due < now ? "Overdue" : "Today"} ${formatTime(due)}`, tone: due < now ? "overdue" : "today" };
  if (diff === 1) return { label: `Tomorrow ${formatTime(due)}`, tone: "soon" };
  return { label: formatDay(due, { weekday: true }), tone: diff <= 3 ? "soon" : "later" };
}

// ── money & numbers ──────────────────────────────────────────────────────────

const SYMBOL: Record<string, string> = { NGN: "₦", USD: "$", GBP: "£", EUR: "€" };

/** "₦1,250,000" / "$84.20". Accepts Prisma Decimals, numbers or strings. */
export function money(value: unknown, currency = "NGN", opts: { decimals?: number; compact?: boolean } = {}): string {
  const n = Number(value ?? 0);
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  const sym = SYMBOL[currency] ?? `${currency} `;
  if (opts.compact && abs >= 1_000) {
    const units: [number, string][] = [[1e9, "bn"], [1e6, "m"], [1e3, "k"]];
    const [div, suffix] = units.find(([d]) => abs >= d)!;
    return `${sign}${sym}${(abs / div).toFixed(abs / div >= 100 ? 0 : 1).replace(/\.0$/, "")}${suffix}`;
  }
  const decimals = opts.decimals ?? (currency === "NGN" ? 0 : 2);
  return `${sign}${sym}${abs.toLocaleString("en-NG", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export function num(value: unknown, decimals = 0): string {
  return Number(value ?? 0).toLocaleString("en-NG", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function pct(value: number | null | undefined, decimals = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(decimals)}%`;
}

export function formatDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${formatDay(date, { weekday: true })} · ${formatTime(date)}`;
}

/** "3m ago", "2h ago", "Tue 20 Oct". */
export function ago(d: Date | string, now = Date.now()): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const s = Math.round((now - date.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d ago`;
  return formatDay(date);
}
