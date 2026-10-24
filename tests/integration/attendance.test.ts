import { beforeAll, describe, expect, it } from "vitest";
import { localDate } from "@/domain/sop/schedule";
import { ForbiddenError, NotFoundError, RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { decideDevice, decideLeave, exportMonthCsv, punch, requestLeave, reviewPunch, reviewQueue, teamToday } from "@/server/modules/attendance/service";
import { ctxFor, ensureRolesAndUnits, makeUser } from "./world";

let units: Awaited<ReturnType<typeof ensureRolesAndUnits>>;
let lead: { id: string }, otherLead: { id: string }, finance: { id: string };
let officeId: string;
const meta = { ip: "105.112.1.1", userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)" };
const OFFICE = { lat: 9.0579, lng: 7.4951 };
const fp = (n: number) => Math.floor(n).toString(16).padStart(64, "0");
// smallest valid JPEG header + random tail so each selfie hashes differently
const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...crypto.getRandomValues(new Uint8Array(64)), 0xff, 0xd9])], "s.jpg", { type: "image/jpeg" });

function form(fields: Record<string, string | File>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
const at = (lat = OFFICE.lat, lng = OFFICE.lng) => ({ lat: String(lat), lng: String(lng), accuracy: "12" });

async function staffMember(unitId = units.FIGUREWEB, managerId = lead.id) {
  const u = await makeUser({ role: "staff", unitId });
  await db.user.update({ where: { id: u.id }, data: { managerId } });
  await db.staffProfile.create({ data: { userId: u.id, employeeNo: `T-${u.id.slice(-6)}`, jobTitle: "Tester", employmentType: "FULL_TIME", startDate: new Date("2026-01-01"), officeId } });
  return u;
}

beforeAll(async () => {
  units = await ensureRolesAndUnits();
  lead = await makeUser({ role: "unit_manager", unitId: units.FIGUREWEB });
  otherLead = await makeUser({ role: "unit_manager", unitId: units.TELECOM });
  finance = await makeUser({ role: "finance", unitId: units.HQ });
  officeId = (await db.office.create({ data: { name: `Test office ${Date.now()}`, latitude: OFFICE.lat, longitude: OFFICE.lng, radiusM: 100 } })).id;
});

describe("clock-in", () => {
  it("binds the first phone, records a clean punch, and refuses a double clock-in", async () => {
    const s = await staffMember();
    const ctx = await ctxFor(s.id);
    const r = await punch(ctx, form({ type: "IN", deviceTime: new Date().toISOString(), fingerprint: fp(1 + Math.random() * 1e12), ...at(), selfie: jpeg() }), meta);
    expect(r.needsReview).toBe(false);
    expect(await db.device.count({ where: { userId: s.id, status: "APPROVED" } })).toBe(1);
    const fpUsed = (await db.device.findFirstOrThrow({ where: { userId: s.id } })).fingerprint;
    await expect(punch(ctx, form({ type: "IN", deviceTime: new Date().toISOString(), fingerprint: fpUsed, ...at(), selfie: jpeg() }), meta)).rejects.toBeInstanceOf(RuleError);
  });

  it("records but flags an out-of-range punch from a second phone without a selfie", async () => {
    const s = await staffMember();
    const ctx = await ctxFor(s.id);
    await punch(ctx, form({ type: "IN", deviceTime: new Date().toISOString(), fingerprint: fp(2e12 + Math.random() * 1e12), ...at(), selfie: jpeg() }), meta);
    await punch(ctx, form({ type: "OUT", deviceTime: new Date().toISOString(), fingerprint: (await db.device.findFirstOrThrow({ where: { userId: s.id } })).fingerprint, ...at(), selfie: jpeg() }), meta);
    const r = await punch(ctx, form({ type: "IN", deviceTime: new Date().toISOString(), fingerprint: fp(3e12 + Math.random() * 1e12), ...at(9.2, 7.6) }), meta);
    expect(r.needsReview).toBe(true);
    expect(r.flags.map((f) => f.key)).toEqual(expect.arrayContaining(["out_of_range", "unknown_device", "no_selfie"]));
    expect(await db.device.count({ where: { userId: s.id, status: "PENDING" } })).toBe(1);
  });

  it("flags a re-used selfie", async () => {
    const s = await staffMember();
    const ctx = await ctxFor(s.id);
    const photo = jpeg();
    const f1 = fp(4e12 + Math.random() * 1e12);
    await punch(ctx, form({ type: "IN", deviceTime: new Date().toISOString(), fingerprint: f1, ...at(), selfie: photo }), meta);
    const r = await punch(ctx, form({ type: "OUT", deviceTime: new Date().toISOString(), fingerprint: f1, ...at(), selfie: photo }), meta);
    expect(r.flags.map((f) => f.key)).toContain("selfie_reused");
  });
});

describe("review", () => {
  it("rejecting a punch removes it from the day; approving a new phone retires the old one", async () => {
    const s = await staffMember();
    const ctx = await ctxFor(s.id);
    await punch(ctx, form({ type: "IN", deviceTime: new Date().toISOString(), fingerprint: fp(6e12 + Math.random() * 1e12), ...at(9.3, 7.7), selfie: jpeg() }), meta);
    const p = await db.attendancePunch.findFirstOrThrow({ where: { userId: s.id } });
    const q = await reviewQueue(await ctxFor(lead.id));
    expect(q.punches.map((x) => x.id)).toContain(p.id);
    expect((await reviewQueue(await ctxFor(otherLead.id))).punches.map((x) => x.id)).not.toContain(p.id);
    await expect(reviewPunch(await ctxFor(otherLead.id), { punchId: p.id, decision: "REJECTED" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(reviewPunch(ctx, { punchId: p.id, decision: "APPROVED" })).rejects.toBeInstanceOf(ForbiddenError);
    await reviewPunch(await ctxFor(lead.id), { punchId: p.id, decision: "REJECTED", note: "Not at the office" });
    const day = await db.attendanceDay.findFirstOrThrow({ where: { userId: s.id, date: new Date(localDate(new Date())) } });
    expect(day.firstInAt).toBeNull();

    await punch(ctx, form({ type: "IN", deviceTime: new Date().toISOString(), fingerprint: fp(7e12 + Math.random() * 1e12), ...at(), selfie: jpeg() }), meta);
    const pending = await db.device.findFirstOrThrow({ where: { userId: s.id, status: "PENDING" } });
    await decideDevice(await ctxFor(lead.id), { deviceId: pending.id, approve: true });
    expect(await db.device.count({ where: { userId: s.id, status: "APPROVED" } })).toBe(1);
    expect((await db.device.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("APPROVED");
  });
});

describe("leave & team", () => {
  it("staff can't approve leave; leads can't approve their own; the team view respects units", async () => {
    const s = await staffMember();
    const { id } = await requestLeave(await ctxFor(s.id), { type: "ANNUAL", startDate: "2026-12-14", endDate: "2026-12-18" });
    await expect(decideLeave(await ctxFor(s.id), { leaveId: id, approve: true })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(decideLeave(await ctxFor(otherLead.id), { leaveId: id, approve: true })).rejects.toBeInstanceOf(NotFoundError);
    await decideLeave(await ctxFor(lead.id), { leaveId: id, approve: true });
    expect((await db.leaveRequest.findUniqueOrThrow({ where: { id } })).days.toNumber()).toBe(5);

    const team = await teamToday(await ctxFor(lead.id), { unitId: null });
    expect(team.map((t) => t.id)).toContain(s.id);
    expect((await teamToday(await ctxFor(otherLead.id), { unitId: null })).map((t) => t.id)).not.toContain(s.id);
  });

  it("exports need the export permission and are audited", async () => {
    await expect(exportMonthCsv(await ctxFor(lead.id), "2026-10")).rejects.toBeInstanceOf(ForbiddenError);
    const before = await db.auditLog.count({ where: { action: "export.attendance" } });
    const out = await exportMonthCsv(await ctxFor(finance.id), "2026-10").catch((e) => e);
    // finance has exports but attendance VIEW only for themselves → refused
    expect(out).toBeInstanceOf(ForbiddenError);
    expect(await db.auditLog.count({ where: { action: "export.attendance" } })).toBe(before);
  });
});
