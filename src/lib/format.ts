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
