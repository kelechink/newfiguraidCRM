// Attendance rules: geofence, punch flags and day status. Pure and unit-tested.
// Suspicious punches are flagged for review, never silently rejected (PRD Module H).

import { addDays, isoWeekday, zonedDateTime } from "../sop/schedule";

export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type PunchFlag =
  | "out_of_range"
  | "low_accuracy"
  | "no_location"
  | "unknown_device"
  | "no_selfie"
  | "selfie_reused"
  | "suspect_location"
  | "clock_skew"
  | "late_sync"
  | "remote";

export const FLAG_LABEL: Record<PunchFlag, string> = {
  out_of_range: "Outside the office geofence",
  low_accuracy: "GPS accuracy too low to confirm",
  no_location: "No location shared",
  unknown_device: "Not their registered phone",
  no_selfie: "No selfie",
  selfie_reused: "Selfie identical to an earlier one",
  suspect_location: "Location looks spoofed",
  clock_skew: "Phone clock doesn't match server time",
  late_sync: "Offline clock-in synced over 12 hours later",
  remote: "Remote clock-in (allowed for this person)",
};

export interface PunchInput {
  office: (LatLng & { radiusM: number }) | null;
  location: (LatLng & { accuracyM: number }) | null;
  deviceTrusted: boolean;
  hasSelfie: boolean;
  selfieReused: boolean;
  deviceTime: Date;
  receivedAt: Date;
  wasOffline: boolean;
  /** Same coordinates to ~1 cm as the previous punch — real GPS always jitters. */
  identicalToPrevious?: boolean;
  remoteAllowed?: boolean;
}

export interface PunchVerdict {
  distanceM: number | null;
  withinGeofence: boolean;
  flags: PunchFlag[];
  needsReview: boolean;
}

const MAX_ACCURACY_M = 150;
const MAX_SKEW_MS = 5 * 60_000;
const LATE_SYNC_MS = 12 * 3_600_000;

export function evaluatePunch(p: PunchInput): PunchVerdict {
  const flags: PunchFlag[] = [];
  let distanceM: number | null = null;
  let within = false;

  if (!p.location) flags.push("no_location");
  else if (p.office) {
    distanceM = Math.round(haversineMeters(p.location, p.office) * 10) / 10;
    within = distanceM <= p.office.radiusM;
    if (!within) flags.push(p.remoteAllowed ? "remote" : "out_of_range");
    if (p.location.accuracyM > Math.max(MAX_ACCURACY_M, p.office.radiusM * 1.5)) flags.push("low_accuracy");
    // Browsers report accuracy ≥ ~3 m; 0 or sub-metre "perfect" fixes are typical of spoofing apps.
    if (p.location.accuracyM < 1 || p.identicalToPrevious) flags.push("suspect_location");
  }
  if (!p.deviceTrusted) flags.push("unknown_device");
  if (!p.hasSelfie) flags.push("no_selfie");
  if (p.selfieReused) flags.push("selfie_reused");

  const skew = Math.abs(p.receivedAt.getTime() - p.deviceTime.getTime());
  if (p.wasOffline) {
    if (skew > LATE_SYNC_MS) flags.push("late_sync");
  } else if (skew > MAX_SKEW_MS) flags.push("clock_skew");

  const needsReview = flags.some((f) => f !== "remote");
  return { distanceM, withinGeofence: within, flags, needsReview };
}

// ── day status ───────────────────────────────────────────────────────────────

export interface Schedule {
  resumeTime: string; // "09:00"
  closeTime: string; // "17:00"
  graceMinutes: number;
  workingDays: number[]; // ISO weekdays
}

// Company rule: Monday–Friday, 09:00–17:00, no grace — 09:00:01 is already late.
export const DEFAULT_SCHEDULE: Schedule = { resumeTime: "09:00", closeTime: "17:00", graceMinutes: 0, workingDays: [1, 2, 3, 4, 5] };

export type DayStatus = "PRESENT" | "LATE" | "ABSENT" | "ON_LEAVE" | "HOLIDAY" | "WEEKEND" | "PENDING";

export interface DayResult {
  status: DayStatus;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  firstInAt: Date | null;
  lastOutAt: Date | null;
  minutesLate: number;
  /** Signed off before scheduled close (last punch of the day is an OUT before close). */
  minutesEarly: number;
  /** Clocked in but never out on a finished day: flagged for review, not charged. */
  missingClockOut: boolean;
  workedMinutes: number;
  overtimeMinutes: number;
}

/** Minutes worked after scheduled close before it counts as overtime. */
const OVERTIME_THRESHOLD_MIN = 30;

export function computeDay(input: {
  date: string; // YYYY-MM-DD (business TZ)
  today: string;
  schedule: Schedule;
  punches: { type: "IN" | "OUT"; at: Date; accepted: boolean }[];
  onLeave: boolean;
  holiday: boolean;
  now?: Date;
}): DayResult {
  const { date, schedule } = input;
  const working = schedule.workingDays.includes(isoWeekday(date));
  const scheduledStart = working ? zonedDateTime(date, schedule.resumeTime) : null;
  const scheduledEnd = working ? zonedDateTime(date, schedule.closeTime) : null;

  // Rejected punches (after review) don't count.
  const punches = input.punches.filter((p) => p.accepted).sort((a, b) => a.at.getTime() - b.at.getTime());
  const ins = punches.filter((p) => p.type === "IN");
  const outs = punches.filter((p) => p.type === "OUT");
  const firstInAt = ins[0]?.at ?? null;
  const lastOutAt = outs.at(-1)?.at ?? null;

  let worked = 0;
  let open: Date | null = null;
  for (const p of punches) {
    if (p.type === "IN" && !open) open = p.at;
    else if (p.type === "OUT" && open) {
      worked += (p.at.getTime() - open.getTime()) / 60_000;
      open = null;
    }
  }
  if (open && date === input.today) worked += ((input.now ?? new Date()).getTime() - open.getTime()) / 60_000;

  const base = { scheduledStart, scheduledEnd, firstInAt, lastOutAt, workedMinutes: Math.max(0, Math.round(worked)), minutesEarly: 0, missingClockOut: false };

  if (input.holiday) return { ...base, status: "HOLIDAY", minutesLate: 0, overtimeMinutes: 0 };
  if (input.onLeave) return { ...base, status: "ON_LEAVE", minutesLate: 0, overtimeMinutes: 0 };
  if (!working) return { ...base, status: firstInAt ? "PRESENT" : "WEEKEND", minutesLate: 0, overtimeMinutes: Math.round(worked) };

  if (!firstInAt) {
    return { ...base, status: date < input.today ? "ABSENT" : "PENDING", minutesLate: 0, overtimeMinutes: 0 };
  }
  // any part of a minute after resumption (plus grace, if a person has one) counts
  const lateBy = Math.ceil((firstInAt.getTime() - scheduledStart!.getTime()) / 60_000);
  const late = lateBy > schedule.graceMinutes;
  const lastPunch = punches.at(-1)!;
  const signedOff = lastPunch.type === "OUT";
  const earlyBy = signedOff ? Math.ceil((scheduledEnd!.getTime() - lastPunch.at.getTime()) / 60_000) : 0;
  const over = lastOutAt ? Math.floor((lastOutAt.getTime() - scheduledEnd!.getTime()) / 60_000) : 0;
  return {
    ...base,
    status: late ? "LATE" : "PRESENT",
    minutesLate: late ? lateBy : 0,
    minutesEarly: earlyBy > 0 ? earlyBy : 0,
    missingClockOut: !signedOff && date < input.today,
    overtimeMinutes: over >= OVERTIME_THRESHOLD_MIN ? over : 0,
  };
}

/** Every calendar date from `from` to `to` inclusive. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
