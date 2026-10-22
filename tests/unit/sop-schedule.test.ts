import { describe, expect, it } from "vitest";
import {
  describeSchedule,
  latestDueOccurrence,
  localDate,
  nextOccurrence,
  occursOn,
  zonedDateTime,
  type SopSchedule,
} from "@/domain/sop/schedule";

const base: SopSchedule = { frequency: "WEEKLY", weekdays: [1], dayOfMonth: null, startsOn: "2026-01-01" };

describe("SOP schedule", () => {
  // 2026-10-22 is a Thursday
  it("daily runs on working days only and skips public holidays", () => {
    const daily = { ...base, frequency: "DAILY" as const };
    expect(occursOn(daily, "2026-10-22")).toBe(true);
    expect(occursOn(daily, "2026-10-24")).toBe(false); // Saturday
    expect(occursOn(daily, "2026-10-01", new Set(["2026-10-01"]))).toBe(false); // Independence Day
  });

  it("weekly runs on the chosen weekdays", () => {
    const monThu = { ...base, weekdays: [1, 4] };
    expect(occursOn(monThu, "2026-10-19")).toBe(true); // Mon
    expect(occursOn(monThu, "2026-10-21")).toBe(false); // Wed
    expect(occursOn(monThu, "2026-10-22")).toBe(true); // Thu
  });

  it("monthly clamps day 31 to the last day of short months", () => {
    const monthly = { ...base, frequency: "MONTHLY" as const, dayOfMonth: 31 };
    expect(occursOn(monthly, "2026-02-28")).toBe(true);
    expect(occursOn(monthly, "2026-04-30")).toBe(true);
    expect(occursOn(monthly, "2026-10-30")).toBe(false);
    expect(occursOn(monthly, "2026-10-31")).toBe(true);
  });

  it("never occurs before startsOn, and on-demand never occurs", () => {
    expect(occursOn({ ...base, startsOn: "2026-10-20" }, "2026-10-19")).toBe(false);
    expect(occursOn({ ...base, frequency: "ON_DEMAND" }, "2026-10-19")).toBe(false);
  });

  it("generates only the latest due occurrence — older misses are superseded", () => {
    const daily = { ...base, frequency: "DAILY" as const };
    expect(latestDueOccurrence(daily, "2026-10-22")).toBe("2026-10-22"); // Thu → today, not Mon–Wed too
    expect(latestDueOccurrence(daily, "2026-10-24")).toBe("2026-10-23"); // Sat → Friday's
    // a Monday SOP pressed on Thursday still yields Monday's (overdue) task
    expect(latestDueOccurrence(base, "2026-10-22")).toBe("2026-10-19");
    // Mon & Thu SOP on Thursday → Thursday supersedes Monday
    expect(latestDueOccurrence({ ...base, weekdays: [1, 4] }, "2026-10-22")).toBe("2026-10-22");
    // nothing in the last 7 days
    expect(latestDueOccurrence({ ...base, frequency: "MONTHLY", dayOfMonth: 1 }, "2026-10-22")).toBeNull();
  });

  it("finds the next occurrence after today", () => {
    expect(nextOccurrence(base, "2026-10-22")).toBe("2026-10-26");
  });

  it("uses Lagos time for 'today' and due times", () => {
    // 23:30 UTC on the 22nd is already 00:30 on the 23rd in Lagos
    expect(localDate(new Date("2026-10-22T23:30:00Z"))).toBe("2026-10-23");
    expect(zonedDateTime("2026-10-22", "17:00").toISOString()).toBe("2026-10-22T16:00:00.000Z");
  });

  it("describes schedules in plain English", () => {
    expect(describeSchedule({ ...base, weekdays: [4, 1] }, "17:00")).toBe("Every Mon & Thu · 17:00");
    expect(describeSchedule({ ...base, frequency: "DAILY" }, "09:30")).toBe("Every working day · 09:30");
  });
});
