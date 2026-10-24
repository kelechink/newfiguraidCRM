import { describe, expect, it } from "vitest";
import { computeDay, DEFAULT_SCHEDULE, evaluatePunch, haversineMeters } from "@/domain/attendance/rules";
import { zonedDateTime } from "@/domain/sop/schedule";

const office = { lat: 9.0765, lng: 7.3986, radiusM: 100 }; // Abuja
const now = new Date("2026-10-22T08:05:00Z");
const base = {
  office,
  location: { lat: 9.0766, lng: 7.3987, accuracyM: 12 },
  deviceTrusted: true,
  hasSelfie: true,
  selfieReused: false,
  deviceTime: now,
  receivedAt: now,
  wasOffline: false,
};

describe("geofence", () => {
  it("measures distance in metres", () => {
    expect(haversineMeters(office, { lat: 9.0765, lng: 7.3986 })).toBe(0);
    // 0.001° of latitude ≈ 111 m
    expect(Math.round(haversineMeters(office, { lat: 9.0775, lng: 7.3986 }))).toBe(111);
  });
});

describe("evaluatePunch", () => {
  it("a normal clock-in at the office needs no review", () => {
    const v = evaluatePunch(base);
    expect(v).toMatchObject({ withinGeofence: true, flags: [], needsReview: false });
    expect(v.distanceM).toBeLessThan(20);
  });

  it("flags but still records out-of-range, unknown phone, missing or reused selfie", () => {
    const v = evaluatePunch({ ...base, location: { lat: 9.09, lng: 7.4, accuracyM: 10 }, deviceTrusted: false, hasSelfie: false });
    expect(v.flags).toEqual(expect.arrayContaining(["out_of_range", "unknown_device", "no_selfie"]));
    expect(v.needsReview).toBe(true);
    expect(evaluatePunch({ ...base, selfieReused: true }).flags).toContain("selfie_reused");
  });

  it("treats remote-allowed staff outside the fence as remote, not suspicious", () => {
    const v = evaluatePunch({ ...base, location: { lat: 9.2, lng: 7.5, accuracyM: 10 }, remoteAllowed: true });
    expect(v.flags).toEqual(["remote"]);
    expect(v.needsReview).toBe(false);
  });

  it("spots spoof-like fixes, poor accuracy and clock tampering", () => {
    expect(evaluatePunch({ ...base, location: { ...base.location, accuracyM: 0 } }).flags).toContain("suspect_location");
    expect(evaluatePunch({ ...base, identicalToPrevious: true }).flags).toContain("suspect_location");
    expect(evaluatePunch({ ...base, location: { ...base.location, accuracyM: 900 } }).flags).toContain("low_accuracy");
    expect(evaluatePunch({ ...base, deviceTime: new Date(now.getTime() - 20 * 60_000) }).flags).toContain("clock_skew");
  });

  it("accepts offline punches synced later, but flags very late syncs", () => {
    const earlier = new Date(now.getTime() - 3 * 3_600_000);
    expect(evaluatePunch({ ...base, deviceTime: earlier, wasOffline: true }).flags).toEqual([]);
    expect(evaluatePunch({ ...base, deviceTime: new Date(now.getTime() - 20 * 3_600_000), wasOffline: true }).flags).toContain("late_sync");
  });
});

describe("computeDay", () => {
  const day = "2026-10-22"; // Thursday
  const at = (t: string) => zonedDateTime(day, t);
  const run = (punches: { type: "IN" | "OUT"; at: Date }[], extra: Partial<Parameters<typeof computeDay>[0]> = {}) =>
    computeDay({ date: day, today: "2026-10-23", schedule: DEFAULT_SCHEDULE, punches: punches.map((p) => ({ ...p, accepted: true })), onLeave: false, holiday: false, ...extra });

  it("09:00 sharp is on time; any time after 09:00 is late (no grace)", () => {
    expect(run([{ type: "IN", at: at("09:00") }, { type: "OUT", at: at("17:05") }])).toMatchObject({ status: "PRESENT", minutesLate: 0, minutesEarly: 0 });
    expect(run([{ type: "IN", at: new Date(at("09:00").getTime() + 30_000) }, { type: "OUT", at: at("17:00") }])).toMatchObject({ status: "LATE", minutesLate: 1 });
    expect(run([{ type: "IN", at: at("09:01") }, { type: "OUT", at: at("17:00") }])).toMatchObject({ status: "LATE", minutesLate: 1 });
  });

  it("signing off before 17:00 is an early departure; no clock-out is flagged, not charged", () => {
    expect(run([{ type: "IN", at: at("08:50") }, { type: "OUT", at: at("16:59") }])).toMatchObject({ status: "PRESENT", minutesEarly: 1, missingClockOut: false });
    expect(run([{ type: "IN", at: at("08:50") }, { type: "OUT", at: at("13:00") }, { type: "IN", at: at("14:00") }, { type: "OUT", at: at("17:00") }]).minutesEarly).toBe(0); // lunch break
    expect(run([{ type: "IN", at: at("08:50") }])).toMatchObject({ minutesEarly: 0, missingClockOut: true });
    expect(run([{ type: "IN", at: at("08:50") }], { today: day }).missingClockOut).toBe(false); // still at work
  });

  it("after grace is late, counting minutes from resumption time", () => {
    expect(run([{ type: "IN", at: at("09:23") }])).toMatchObject({ status: "LATE", minutesLate: 23 });
  });

  it("no punches on a past working day is absent; today is still pending", () => {
    expect(run([]).status).toBe("ABSENT");
    expect(run([], { today: day }).status).toBe("PENDING");
  });

  it("approved leave and public holidays are never absent or late", () => {
    expect(run([], { onLeave: true }).status).toBe("ON_LEAVE");
    expect(run([{ type: "IN", at: at("11:00") }], { holiday: true })).toMatchObject({ status: "HOLIDAY", minutesLate: 0 });
  });

  it("sums worked time across breaks and counts overtime after 30 minutes", () => {
    const r = run([
      { type: "IN", at: at("08:55") },
      { type: "OUT", at: at("13:00") },
      { type: "IN", at: at("14:00") },
      { type: "OUT", at: at("18:10") },
    ]);
    expect(r.workedMinutes).toBe(245 + 250);
    expect(r.overtimeMinutes).toBe(70);
  });

  it("ignores punches rejected in review", () => {
    const r = computeDay({ date: day, today: "2026-10-23", schedule: DEFAULT_SCHEDULE, punches: [{ type: "IN", at: at("09:00"), accepted: false }], onLeave: false, holiday: false });
    expect(r.status).toBe("ABSENT");
  });
});
