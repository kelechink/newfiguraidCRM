import { beforeAll, describe, expect, it } from "vitest";
import { ForbiddenError, RuleError } from "@/server/authz/errors";
import { sha256 } from "@/server/crypto/tokens";
import { db } from "@/server/db";
import { certificateCode, enroll, issueCertificate, reissueCertificate, revokeCertificate, saveCohort, saveCourse, updateEnrollment, verifyCertificate } from "@/server/modules/academy/service";
import { createContact } from "@/server/modules/crm/contacts-service";
import { decidePayout, requestPayout } from "@/server/modules/growth/referrals-service";
import { moveTender, saveTender } from "@/server/modules/growth/tenders-service";
import { dsrMatches, eraseContact, exportContactData, submitDsr, updateDsr } from "@/server/modules/privacy/service";
import { addComment, createTicket, getTicket, listTickets, peekCsat, submitCsat, updateTicket } from "@/server/modules/support/service";
import { listDocuments } from "@/server/modules/vault/service";
import { ctxFor, ensureRolesAndUnits, makeUser } from "./world";

let units: Awaited<ReturnType<typeof ensureRolesAndUnits>>;
let admin: { id: string }, coordinator: { id: string }, webStaff: { id: string }, agent: { id: string }, finance: { id: string }, marketer: { id: string }, webLead: { id: string };
const rnd = () => Math.random().toString(36).slice(2, 8);
const phone = () => `080${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

beforeAll(async () => {
  units = await ensureRolesAndUnits();
  admin = await makeUser({ role: "admin", unitId: units.HQ });
  coordinator = await makeUser({ role: "academy_coordinator", unitId: units.ACADEMY });
  webStaff = await makeUser({ role: "staff", unitId: units.FIGUREWEB });
  agent = await makeUser({ role: "support_agent", unitId: units.HQ });
  finance = await makeUser({ role: "finance", unitId: units.HQ });
  marketer = await makeUser({ role: "marketing", unitId: units.HQ });
  webLead = await makeUser({ role: "unit_manager", unitId: units.FIGUREWEB });
});

describe("certificates", () => {
  it("issues unguessable codes only for completed students, verifies publicly, and handles revoke and reissue", async () => {
    expect(certificateCode()).toMatch(/^FA-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    const c = await ctxFor(coordinator.id);
    const code = `AI${rnd().toUpperCase()}`;
    await saveCourse(c, { unitId: units.ACADEMY, code, title: "AI Foundations", priceNgn: 150000 });
    const course = await db.course.findUniqueOrThrow({ where: { code } });
    await saveCohort(c, { courseId: course.id, name: "Cohort 4", startDate: "2026-09-01", endDate: "2026-10-15", capacity: 30 });
    const cohort = await db.cohort.findFirstOrThrow({ where: { courseId: course.id } });
    const student = await createContact(c, { displayName: `Student ${rnd()}`, phone: phone(), unitId: units.ACADEMY });
    await enroll(c, { cohortId: cohort.id, contactId: student.id });
    const e = await db.courseEnrollment.findFirstOrThrow({ where: { cohortId: cohort.id } });
    await expect(updateEnrollment(c, { enrollmentId: e.id, scholarshipPct: 50 })).rejects.toBeInstanceOf(RuleError); // needs a reason
    await updateEnrollment(c, { enrollmentId: e.id, scholarshipPct: 50, scholarshipNote: "Akwa Ibom youth scheme" });
    expect(Number((await db.courseEnrollment.findUniqueOrThrow({ where: { id: e.id } })).amountDue)).toBe(75000);
    await expect(issueCertificate(c, e.id)).rejects.toBeInstanceOf(RuleError);
    await updateEnrollment(c, { enrollmentId: e.id, state: "COMPLETED" });
    const cert = await issueCertificate(c, e.id);
    await expect(issueCertificate(c, e.id)).rejects.toBeInstanceOf(RuleError);
    expect(await verifyCertificate(cert.code.toLowerCase())).toMatchObject({ status: "VALID", courseTitle: "AI Foundations" });
    expect(await verifyCertificate("FA-AAAA-AAAA-AAAA")).toBeNull();
    expect(await verifyCertificate("'; drop table x")).toBeNull();
    const re = await reissueCertificate(c, { certificateId: cert.id, recipientName: "Corrected Name" });
    expect(await verifyCertificate(cert.code)).toMatchObject({ status: "SUPERSEDED", recipientName: null });
    await revokeCertificate(c, { certificateId: re.id, reason: "Exam misconduct confirmed" });
    expect((await verifyCertificate(re.code))!.status).toBe("REVOKED");
    await expect(issueCertificate(await ctxFor(webStaff.id), e.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("tenders", () => {
  it("can't be marked submitted until every required document is in", async () => {
    const l = await ctxFor(webLead.id);
    const { id } = await saveTender(l, { unitId: units.FIGUREWEB, title: `State portal ${rnd()}`, agency: "Ministry of Science & Digital Economy", deadline: new Date(Date.now() + 20 * 86_400_000).toISOString() });
    await expect(moveTender(l, { tenderId: id, stage: "SUBMITTED" })).rejects.toBeInstanceOf(RuleError);
    await db.tenderChecklistItem.updateMany({ where: { tenderId: id }, data: { doneAt: new Date() } });
    await moveTender(l, { tenderId: id, stage: "SUBMITTED" });
    await expect(moveTender(l, { tenderId: id, stage: "AWARDED" })).rejects.toBeInstanceOf(RuleError);
    await expect(saveTender(l, { unitId: units.TELECOM, title: "x tender", agency: "Agency", deadline: new Date().toISOString() })).rejects.toBeInstanceOf(RuleError);
  });
});

describe("referral payouts", () => {
  it("bundle won commissions, need a different approver, and land in finance as an expense", async () => {
    const contact = await createContact(await ctxFor(webLead.id), { displayName: `Referred ${rnd()}`, phone: phone(), unitId: units.FIGUREWEB });
    const referrer = await db.referrer.create({ data: { type: "PARTNER", name: `Partner ${rnd()}`, code: `P${rnd().toUpperCase()}` } });
    await db.referral.create({ data: { referrerId: referrer.id, contactId: contact.id, status: "won", commissionAmount: 25000 } });
    await requestPayout(await ctxFor(marketer.id), referrer.id);
    await expect(requestPayout(await ctxFor(marketer.id), referrer.id)).rejects.toBeInstanceOf(RuleError);
    const payout = await db.referralPayout.findFirstOrThrow({ where: { referrerId: referrer.id } });
    await expect(decidePayout(await ctxFor(marketer.id), { payoutId: payout.id, approve: true })).rejects.toBeInstanceOf(ForbiddenError);
    await decidePayout(await ctxFor(finance.id), { payoutId: payout.id, approve: true });
    const p = await db.referralPayout.findUniqueOrThrow({ where: { id: payout.id }, include: { expense: true } });
    expect(p.status).toBe("APPROVED");
    expect(Number(p.expense!.amount)).toBe(25000);
    expect((await db.referral.findFirstOrThrow({ where: { referrerId: referrer.id } })).status).toBe("paid");
  });
});

describe("support tickets", () => {
  it("sets SLA by priority, stops the clock on the first public reply, and collects a one-time CSAT rating", async () => {
    const a = await ctxFor(agent.id);
    const contact = await createContact(await ctxFor(webLead.id), { displayName: `Customer ${rnd()}`, email: `${rnd()}@cust.ng`, unitId: units.FIGUREWEB });
    const t = await createTicket(a, { unitId: units.FIGUREWEB, contactId: contact.id, subject: "Email not sending", body: "Since this morning", priority: "URGENT" });
    const row = await db.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.firstResponseDueAt!.getTime() - row.createdAt.getTime()).toBe(3_600_000);
    await addComment(a, { ticketId: t.id, body: "Looking into it now", isPublic: true });
    expect((await getTicket(a, t.id)).firstResponseAt).not.toBeNull();
    await updateTicket(a, { ticketId: t.id, status: "RESOLVED" });
    const hash = (await db.ticket.findUniqueOrThrow({ where: { id: t.id } })).csatTokenHash;
    expect(hash).toBeTruthy();
    // the raw token only exists in the email; fake one for the test by swapping the hash
    await db.ticket.update({ where: { id: t.id }, data: { csatTokenHash: sha256("test-token-abcdefghijklmnop") } });
    expect(await peekCsat("test-token-abcdefghijklmnop")).toMatchObject({ done: false });
    await submitCsat({ token: "test-token-abcdefghijklmnop", score: 2, comment: "Slow" });
    await expect(submitCsat({ token: "test-token-abcdefghijklmnop", score: 5 })).rejects.toBeInstanceOf(RuleError);
    expect((await db.ticket.findUniqueOrThrow({ where: { id: t.id } })).csatScore).toBe(2);
    expect((await listTickets(await ctxFor(webStaff.id), { view: "all" })).map((x) => x.id)).not.toContain(t.id); // staff see only their own
  });
});

describe("privacy requests", () => {
  it("need identity verification before export or erasure, and erase personal data but keep financial records", async () => {
    const email = `${rnd()}@person.ng`;
    const contact = await createContact(await ctxFor(webLead.id), { displayName: `Data Subject ${rnd()}`, email, phone: phone(), unitId: units.FIGUREWEB });
    await db.consent.create({ data: { contactId: contact.id, channel: "EMAIL", granted: true, source: "test" } });
    const { reference } = await submitDsr({ type: "DELETION", name: "Data Subject", email });
    const dsr = await db.dataSubjectRequest.findFirstOrThrow({ where: { requesterEmail: email } });
    expect(reference).toBe(dsr.id.slice(-8).toUpperCase());
    const ad = await ctxFor(admin.id);
    await expect(dsrMatches(ad, dsr.id)).rejects.toBeInstanceOf(RuleError);
    await expect(dsrMatches(await ctxFor(finance.id), dsr.id)).rejects.toBeInstanceOf(ForbiddenError);
    await updateDsr(ad, { dsrId: dsr.id, verified: true, status: "IN_PROGRESS" });
    const matches = await dsrMatches(ad, dsr.id);
    expect(matches.map((m) => m.id)).toContain(contact.id);
    await updateDsr(ad, { dsrId: dsr.id, contactId: contact.id });
    const exported = JSON.parse((await exportContactData(ad, dsr.id)).json);
    expect(exported.email).toBe(email);
    await eraseContact(ad, dsr.id);
    const c = await db.contact.findUniqueOrThrow({ where: { id: contact.id } });
    expect([c.email, c.phoneE164, c.firstName]).toEqual([null, null, null]);
    expect(c.deletedAt).not.toBeNull();
    expect(await db.consent.count({ where: { contactId: contact.id } })).toBe(0);
    expect((await db.dataSubjectRequest.findUniqueOrThrow({ where: { id: dsr.id } })).status).toBe("COMPLETED");
  });
});

describe("vault", () => {
  it("hides restricted documents from roles outside the list", async () => {
    const d = await db.document.create({ data: { title: `Carrier MSA ${rnd()}`, category: "CARRIER_AGREEMENT", restrictedTo: ["admin", "finance"], status: "SIGNED" } });
    expect((await listDocuments(await ctxFor(admin.id), {})).map((x) => x.id)).toContain(d.id);
    expect((await listDocuments(await ctxFor(agent.id), {})).map((x) => x.id)).not.toContain(d.id);
  });
});
