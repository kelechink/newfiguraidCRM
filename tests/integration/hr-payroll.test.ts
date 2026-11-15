import { beforeAll, describe, expect, it } from "vitest";
import { contentHash } from "@/domain/hr/content-hash";
import { can } from "@/server/authz/context";
import { ForbiddenError, RuleError } from "@/server/authz/errors";
import { decryptJson } from "@/server/crypto/field";
import { db } from "@/server/db";
import { approveTemplate, generatePack, getDocument, myDocuments, saveTemplate, signDocument } from "@/server/modules/hr/contracts-service";
import { listDeductions, savePolicy } from "@/server/modules/hr/deductions-service";
import { openExit, revokeAccess } from "@/server/modules/hr/exit-service";
import { createRun, getRun, myPayslips, renderPayslip, transitionRun } from "@/server/modules/hr/payroll-service";
import { getStaff, savePay, saveProfile } from "@/server/modules/hr/staff-service";
import { ctxFor, ensureRolesAndUnits, makeUser } from "./world";

let units: Awaited<ReturnType<typeof ensureRolesAndUnits>>;
let superAdmin: { id: string }, admin: { id: string }, finance: { id: string }, hr: { id: string }, staff: { id: string };
const meta = { ip: "10.0.0.1", userAgent: "vitest" };
// each run uses its own month far in the past so runs never collide
const M = `20${String(10 + Math.floor(Math.random() * 15)).padStart(2, "0")}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}`;
const d = (day: number) => `${M}-${String(day).padStart(2, "0")}`;

beforeAll(async () => {
  units = await ensureRolesAndUnits();
  superAdmin = await makeUser({ role: "super_admin", unitId: units.HQ });
  admin = await makeUser({ role: "admin", unitId: units.HQ });
  finance = await makeUser({ role: "finance", unitId: units.HQ });
  hr = await makeUser({ role: "hr", unitId: units.HQ });
  staff = await makeUser({ role: "staff", unitId: units.ACADEMY });
  await db.payrollRun.deleteMany({ where: { periodMonth: M } }).catch(() => undefined);
});

async function profileFor(userId: string, salary: number) {
  await saveProfile(await ctxFor(hr.id), { userId, jobTitle: "Tutor", employmentType: "FULL_TIME", startDate: `${M.slice(0, 4)}-01-01`, resumeTime: "09:00", closeTime: "17:00", workingDays: [1, 2, 3, 4, 5] });
  await savePay(await ctxFor(admin.id), { userId, salary, allowances: [{ name: "Housing", amount: 0 }] });
}

describe("salaries are encrypted and need permission", () => {
  it("stores ciphertext, shows pay only to salary holders and the person, and stops self-setting", async () => {
    await profileFor(staff.id, 220_000);
    const row = await db.staffProfile.findUniqueOrThrow({ where: { userId: staff.id } });
    expect(row.salaryEnc).not.toContain("220000");
    expect((await getStaff(await ctxFor(hr.id), staff.id)).pay).toBeNull(); // HR sees deductions, not salaries
    expect((await getStaff(await ctxFor(staff.id), staff.id)).pay!.salary).toBe(220_000);
    expect((await getStaff(await ctxFor(finance.id), staff.id)).pay!.salary).toBe(220_000);
    await expect(savePay(await ctxFor(hr.id), { userId: staff.id, salary: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(savePay(await ctxFor(admin.id), { userId: admin.id, salary: 1 })).rejects.toBeInstanceOf(RuleError);
    expect(await db.auditLog.count({ where: { action: "staff.view_sensitive", entityId: staff.id } })).toBeGreaterThan(0);
  });
});

describe("payroll deductions", () => {
  it("charges unexcused lateness and absence only, honours leave, excuses and holidays, and applies the cap", async () => {
    const person = await makeUser({ role: "staff", unitId: units.TELECOM });
    await profileFor(person.id, 210_000);
    await savePolicy(await ctxFor(hr.id), { name: `Telecom ${M}`, unitId: units.TELECOM, latenessMode: "TIERED", tiers: [{ fromMinutes: 1, toMinutes: 30, amount: 1000 }, { fromMinutes: 31, toMinutes: null, amount: 3000 }], absenceMode: "FIXED", absenceAmount: 5000, monthlyCapAmount: 8000, effectiveFrom: `${M}-01` });
    const day = (date: string, status: "LATE" | "ABSENT" | "ON_LEAVE" | "HOLIDAY", minutesLate = 0) => db.attendanceDay.create({ data: { userId: person.id, date: new Date(date), status, minutesLate } });
    await day(d(3), "LATE", 10); // 1,000
    const excused = await day(d(4), "LATE", 50); // excused → 0
    await db.attendanceExcuse.create({ data: { dayId: excused.id, userId: person.id, reason: "Hospital", status: "APPROVED" } });
    const pendingExcuse = await day(d(5), "LATE", 45); // pending excuse still charged: 3,000
    await db.attendanceExcuse.create({ data: { dayId: pendingExcuse.id, userId: person.id, reason: "Traffic", status: "PENDING" } });
    await day(d(6), "ON_LEAVE");
    await day(d(7), "HOLIDAY");
    await day(d(10), "ABSENT"); // 5,000 → capped to 4,000 (cap 8,000)
    const r = await listDeductions(await ctxFor(person.id), { month: M });
    expect(r.rows.map((x) => [x.date, x.type, x.amount, x.status])).toEqual([[d(3), "LATENESS", 1000, "active"], [d(5), "LATENESS", 3000, "active"], [d(10), "ABSENCE", 4000, "capped"]]);
    expect(r.total).toBe(8000);
    await expect(listDeductions(await ctxFor(staff.id), { userId: person.id, month: M })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("payroll run", () => {
  it("separates preparer and approver, needs Super Admin sign-off over the limit, and locks attendance when paid", async () => {
    await db.setting.upsert({ where: { key: "payroll.signoff_limit_ngn" }, update: { value: 1000 }, create: { key: "payroll.signoff_limit_ngn", value: 1000 } });
    const fin = await ctxFor(finance.id);
    const { id } = await createRun(fin, { periodMonth: M });
    await expect(createRun(fin, { periodMonth: M })).rejects.toBeInstanceOf(RuleError);
    const run = await getRun(fin, id);
    const mine = run.rows.find((r) => r.userId === staff.id)!;
    expect(mine.breakdown.gross).toBe(220_000);
    expect(mine.breakdown.net).toBeLessThan(220_000); // pension + PAYE
    expect(run.needsSignoff).toBe(true);
    const slip = await db.payslip.findUniqueOrThrow({ where: { id: mine.id } });
    expect(slip.breakdownEnc).not.toContain("220000");
    expect(decryptJson<{ breakdown: { gross: number } }>(slip.breakdownEnc).breakdown.gross).toBe(220_000);

    await transitionRun(fin, { runId: id, to: "submit" });
    await expect(transitionRun(fin, { runId: id, to: "approve" })).rejects.toBeInstanceOf(RuleError); // preparer can't approve
    await expect(transitionRun(await ctxFor(hr.id), { runId: id, to: "approve" })).rejects.toBeInstanceOf(ForbiddenError);
    await transitionRun(await ctxFor(admin.id), { runId: id, to: "approve" });
    await expect(transitionRun(await ctxFor(admin.id), { runId: id, to: "paid" })).rejects.toBeInstanceOf(RuleError); // over the limit
    await expect(transitionRun(await ctxFor(admin.id), { runId: id, to: "signoff" })).rejects.toBeInstanceOf(ForbiddenError); // admin lacks payroll.signoff
    expect(await myPayslips(await ctxFor(staff.id))).not.toContainEqual(expect.objectContaining({ month: M })); // not visible until paid
    await transitionRun(await ctxFor(superAdmin.id), { runId: id, to: "signoff" });
    await db.attendanceDay.create({ data: { userId: staff.id, date: new Date(d(12)), status: "PRESENT" } });
    await transitionRun(await ctxFor(admin.id), { runId: id, to: "paid" });
    expect((await db.attendanceDay.findFirstOrThrow({ where: { userId: staff.id, date: new Date(d(12)) } })).payrollLockedAt).not.toBeNull();
    const slips = await myPayslips(await ctxFor(staff.id));
    expect(slips.find((s) => s.month === M)!.net).toBe(mine.breakdown.net);
    const pdf = await renderPayslip(await ctxFor(staff.id), mine.id);
    expect(Buffer.from(pdf.base64, "base64").subarray(0, 4).toString()).toBe("%PDF");
    const other = run.rows.find((r) => r.userId !== staff.id);
    if (other) await expect(renderPayslip(await ctxFor(staff.id), other.id)).rejects.toThrow();
    await db.setting.update({ where: { key: "payroll.signoff_limit_ngn" }, data: { value: 10_000_000 } });
  });
});

describe("contract pack", () => {
  it("unlocks the account only after the joiner signs every document with their exact name over the exact text", async () => {
    const h = await ctxFor(hr.id);
    for (const kind of ["EMPLOYMENT", "NDA"] as const) {
      await saveTemplate(h, { kind, title: `${kind} agreement`, body: `This ${kind} agreement is between {{company.name}} and {{staff.name}} ({{staff.jobTitle}}), starting {{staff.startDate}}. Resumption {{staff.resumeTime}}.` });
      const t = await db.contractTemplate.findFirstOrThrow({ where: { kind, status: "draft" }, orderBy: { version: "desc" } });
      await approveTemplate(h, { templateId: t.id, lawyerName: "A. Bello (counsel)" });
    }
    await expect(saveTemplate(h, { kind: "NDA", title: "NDA", body: "Your salary is {{pay.salary}} and nothing else matters here." })).rejects.toBeInstanceOf(RuleError);
    const joiner = await makeUser({ role: "staff", unitId: units.FIGUREWEB, status: "ONBOARDING" });
    await saveProfile(h, { userId: joiner.id, jobTitle: "Web developer", employmentType: "FULL_TIME", startDate: "2026-11-02" });
    const pack = await generatePack(h, { userId: joiner.id });
    expect(pack.documents).toBeGreaterThanOrEqual(2);
    const j = await ctxFor(joiner.id);
    expect(can(j, "tasks", "VIEW")).toBe(false); // onboarding: work modules locked
    const docs = (await myDocuments(j)).filter((x) => x.mustSign);
    const first = await getDocument(j, docs[0]!.id);
    expect(first.body).toContain("Web developer");
    await expect(signDocument(j, { documentId: first.id, typedName: "Someone Else", contentHash: first.contentHash, agree: true }, meta)).rejects.toBeInstanceOf(RuleError);
    await expect(signDocument(j, { documentId: first.id, typedName: j.name, contentHash: contentHash("tampered"), agree: true }, meta)).rejects.toBeInstanceOf(RuleError);
    await expect(signDocument(await ctxFor(superAdmin.id), { documentId: first.id, typedName: "x y z", contentHash: first.contentHash, agree: true }, meta)).rejects.toThrow(); // countersign waits for staff
    for (const doc of docs) {
      const full = await getDocument(j, doc.id);
      await signDocument(j, { documentId: doc.id, typedName: j.name.toUpperCase(), contentHash: full.contentHash, agree: true }, meta);
    }
    expect((await db.user.findUniqueOrThrow({ where: { id: joiner.id } })).status).toBe("ACTIVE");
    expect((await db.contractPack.findUniqueOrThrow({ where: { id: pack.id } })).status).toBe("STAFF_SIGNED");
    const sig = await db.signature.findFirstOrThrow({ where: { document: { packId: pack.id }, role: "STAFF" } });
    expect(sig).toMatchObject({ status: "signed", ip: "10.0.0.1" });
    expect(can(await ctxFor(joiner.id), "tasks", "VIEW")).toBe(true);
  });
});

describe("exit", () => {
  it("revokes sessions, grants and access when the exit is processed", async () => {
    const leaver = await makeUser({ role: "staff", unitId: units.HQ });
    await db.userSession.create({ data: { userId: leaver.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    await db.userGrant.create({ data: { userId: leaver.id, module: "crm.contacts", action: "VIEW", scope: "ALL", grantedById: admin.id } });
    const h = await ctxFor(hr.id);
    await openExit(h, { userId: leaver.id, type: "TERMINATION", noticeDate: new Date().toISOString().slice(0, 10), lastWorkingDay: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10), reason: "Gross misconduct" });
    await expect(openExit(h, { userId: hr.id, type: "RESIGNATION", noticeDate: "2026-01-01", lastWorkingDay: "2026-02-01" })).rejects.toBeInstanceOf(RuleError);
    const exit = await db.exitCase.findFirstOrThrow({ where: { userId: leaver.id } });
    await revokeAccess(h, exit.id);
    const u = await db.user.findUniqueOrThrow({ where: { id: leaver.id } });
    expect(u.status).toBe("EXITED");
    expect(u.sessionVersion).toBe(1);
    expect(await db.userSession.count({ where: { userId: leaver.id, revokedAt: null } })).toBe(0);
    expect(await db.userGrant.count({ where: { userId: leaver.id, revokedAt: null } })).toBe(0);
  });
});
