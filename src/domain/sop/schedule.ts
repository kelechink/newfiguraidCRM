// SOP schedule maths. Dates are plain "YYYY-MM-DD" strings in the business
// timezone (Africa/Lagos) so a 23:30 click never lands on the wrong day.

export type SopFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "ON_DEMAND";

export interface SopSchedule {
  frequency: SopFrequency;
  weekdays: number[]; // ISO 1=Mon … 7=Sun
  dayOfMonth: number | null;
  startsOn: string; // YYYY-MM-DD
}

export const BUSINESS_TZ = "Africa/Lagos";

/** How far back "Generate due tasks" looks for a missed occurrence. */
export const CATCH_UP_DAYS = 7;

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Calendar date of `instant` in `timeZone`. */
export function localDate(instant: Date, timeZone = BUSINESS_TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toUtcMidnight(date: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(date: string, days: number): string {
  const dt = toUtcMidnight(date);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function isoWeekday(date: string): number {
  const day = toUtcMidnight(date).getUTCDay(); // 0=Sun
  return day === 0 ? 7 : day;
}

function daysInMonth(date: string): number {
  const dt = toUtcMidnight(date);
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
}

/** Does the SOP fall due on `date`? Public holidays skip DAILY/WEEKLY occurrences. */
export function occursOn(s: SopSchedule, date: string, holidays: ReadonlySet<string> = new Set()): boolean {
  if (date < s.startsOn) return false;
  const weekday = isoWeekday(date);
  switch (s.frequency) {
    case "DAILY":
      return weekday <= 5 && !holidays.has(date);
    case "WEEKLY":
      return s.weekdays.includes(weekday) && !holidays.has(date);
    case "MONTHLY": {
      if (!s.dayOfMonth) return false;
      const day = Number(date.slice(8, 10));
      // a 31st-of-month SOP runs on the 30th, or the 28th/29th in February
      return day === Math.min(s.dayOfMonth, daysInMonth(date));
    }
    case "ON_DEMAND":
      return false;
  }
}

/**
 * The occurrence that is due now: the most recent one in the catch-up window
 * (today included). Older missed occurrences are superseded — nobody needs
 * Monday's inbox sweep on Friday — but a weekly SOP missed on Monday is still
 * generated on Thursday if Thursday isn't itself a run day.
 */
export function latestDueOccurrence(
  s: SopSchedule,
  today: string,
  holidays: ReadonlySet<string> = new Set(),
  catchUpDays = CATCH_UP_DAYS,
): string | null {
  for (let offset = 0; offset < catchUpDays; offset++) {
    const date = addDays(today, -offset);
    if (occursOn(s, date, holidays)) return date;
  }
  return null;
}

/** Next occurrence strictly after `today` (for "Next: Thu 24 Oct"), searching up to a year. */
export function nextOccurrence(s: SopSchedule, today: string, holidays: ReadonlySet<string> = new Set()): string | null {
  for (let offset = 1; offset <= 366; offset++) {
    const date = addDays(today, offset);
    if (occursOn(s, date, holidays)) return date;
  }
  return null;
}

/** "HH:mm" on `date` in `timeZone`, as a UTC instant. */
export function zonedDateTime(date: string, time: string, timeZone = BUSINESS_TZ): Date {
  const [h, min] = time.split(":").map(Number) as [number, number];
  const asIfUtc = new Date(`${date}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00Z`);
  // Offset of the zone at that instant (Lagos is a fixed UTC+1, but don't assume it).
  const zoned = new Date(asIfUtc.toLocaleString("en-US", { timeZone }));
  const utc = new Date(asIfUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(asIfUtc.getTime() - (zoned.getTime() - utc.getTime()));
}

export function occurrenceKey(date: string, assigneeId: string): string {
  return `${date}:${assigneeId}`;
}

/** Plain-English schedule for cards, e.g. "Every Mon & Thu · 17:00". */
export function describeSchedule(s: SopSchedule, dueTime: string): string {
  switch (s.frequency) {
    case "DAILY":
      return `Every working day · ${dueTime}`;
    case "WEEKLY": {
      const days = [...s.weekdays].sort().map((d) => WEEKDAY_SHORT[d - 1]);
      const list = days.length > 1 ? `${days.slice(0, -1).join(", ")} & ${days.at(-1)}` : (days[0] ?? "—");
      return `Every ${list} · ${dueTime}`;
    }
    case "MONTHLY":
      return `Monthly on day ${s.dayOfMonth ?? "?"} · ${dueTime}`;
    case "ON_DEMAND":
      return "On demand";
  }
}
