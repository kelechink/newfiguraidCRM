import "server-only";
import { randomInt } from "node:crypto";
import QRCode from "qrcode";
import { z } from "zod";
import { audit } from "@/server/audit/audit";
import { requireScope, scopeOf, type Ctx } from "@/server/authz/context";
import { NotFoundError, RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { appUrl, sendEmail } from "@/server/email/send";
import { A4, ACCENT, Doc, fmtDate, M, MUTED } from "@/server/pdf/kit";

const id = z.string().cuid();
const STATES = ["APPLIED", "SCREENED", "ENROLLED", "ACTIVE", "COMPLETED", "WITHDRAWN"] as const;
// unambiguous alphabet: no 0/O, 1/I/L
const ALPHA = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** FA-7KQ2-M9XD-P4TA: 60 bits from a CSPRNG, so codes can't be guessed or enumerated. */
export function certificateCode(): string {
  const block = () => Array.from({ length: 4 }, () => ALPHA[randomInt(ALPHA.length)]).join("");
  return `FA-${block()}-${block()}-${block()}`;
}

function academyUnits(ctx: Ctx, module: "academy" | "academy.certificates", action: "VIEW" | "CREATE" | "EDIT") {
  const s = requireScope(ctx, module, action);
  return s === "ALL" ? {} : { unitId: { in: ctx.unitIds } };
}

export async function listCourses(ctx: Ctx) {
  const rows = await db.course.findMany({ where: academyUnits(ctx, "academy", "VIEW"), include: { cohorts: { orderBy: { startDate: "desc" }, include: { _count: { select: { enrollments: true } } } } }, orderBy: [{ isActive: "desc" }, { title: "asc" }] });
  return rows.map((c) => ({ id: c.id, code: c.code, title: c.title, description: c.description, priceNgn: c.priceNgn != null ? Number(c.priceNgn) : null, isActive: c.isActive, unitId: c.unitId, cohorts: c.cohorts.map((h) => ({ id: h.id, name: h.name, startDate: h.startDate.toISOString().slice(0, 10), endDate: h.endDate.toISOString().slice(0, 10), capacity: h.capacity, status: h.status, enrolled: h._count.enrollments })) }));
}

export async function saveCourse(ctx: Ctx, raw: unknown) {
  const input = z.object({ id: id.optional(), unitId: id, code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/), title: z.string().trim().min(3).max(120), description: z.string().trim().max(2000).optional(), priceNgn: z.coerce.number().min(0).max(1e9).nullable().default(null), isActive: z.boolean().default(true) }).parse(raw);
  const s = requireScope(ctx, "academy", input.id ? "EDIT" : "CREATE");
  if (s !== "ALL" && !ctx.unitIds.includes(input.unitId)) throw new RuleError("Pick your unit");
  const clash = await db.course.findUnique({ where: { code: input.code } });
  if (clash && clash.id !== input.id) throw new RuleError("That course code is taken");
  const { id: courseId, ...data } = input;
  await db.$transaction(async (tx) => {
    const c = courseId ? await tx.course.update({ where: { id: courseId }, data: { ...data, description: data.description || null } }) : await tx.course.create({ data: { ...data, description: data.description || null } });
    await audit(tx, { actorId: ctx.userId, action: courseId ? "course.update" : "course.create", entityType: "Course", entityId: c.id, unitId: c.unitId });
  });
}

export async function saveCohort(ctx: Ctx, raw: unknown) {
  const input = z.object({ id: id.optional(), courseId: id, name: z.string().trim().min(3).max(120), startDate: z.coerce.date(), endDate: z.coerce.date(), capacity: z.coerce.number().int().min(1).max(10000).nullable().default(null), status: z.enum(["planned", "running", "completed"]).default("planned") }).parse(raw);
  requireScope(ctx, "academy", input.id ? "EDIT" : "CREATE");
  if (input.endDate < input.startDate) throw new RuleError("The cohort ends before it starts");
  const course = await db.course.findFirst({ where: { AND: [{ id: input.courseId }, academyUnits(ctx, "academy", "EDIT")] } });
  if (!course) throw new NotFoundError("Course");
  const { id: cohortId, ...data } = input;
  if (cohortId) await db.cohort.update({ where: { id: cohortId }, data });
  else await db.cohort.create({ data });
}

export async function cohortRoster(ctx: Ctx, cohortId: string) {
  const h = await db.cohort.findFirst({ where: { id: cohortId, course: academyUnits(ctx, "academy", "VIEW") }, include: { course: true, enrollments: { include: { contact: { select: { id: true, displayName: true, email: true, phoneE164: true } }, certificates: { orderBy: { createdAt: "desc" } } }, orderBy: { createdAt: "asc" } } } });
  if (!h) throw new NotFoundError("Cohort");
  return {
    id: h.id,
    name: h.name,
    course: { id: h.course.id, title: h.course.title, priceNgn: h.course.priceNgn != null ? Number(h.course.priceNgn) : null },
    startDate: h.startDate.toISOString().slice(0, 10),
    endDate: h.endDate.toISOString().slice(0, 10),
    capacity: h.capacity,
    status: h.status,
    students: h.enrollments.map((e) => ({
      id: e.id,
      contact: { id: e.contact.id, name: e.contact.displayName, email: e.contact.email, phone: e.contact.phoneE164 },
      state: e.state,
      scholarshipPct: e.scholarshipPct,
      scholarshipNote: e.scholarshipNote,
      amountDue: e.amountDue != null ? Number(e.amountDue) : null,
      attendancePct: e.attendancePct != null ? Number(e.attendancePct) : null,
      completedAt: e.completedAt?.toISOString() ?? null,
      certificate: e.certificates[0] ? { id: e.certificates[0].id, code: e.certificates[0].code, status: e.certificates[0].status } : null,
    })),
  };
}

export async function enroll(ctx: Ctx, raw: unknown) {
  const { cohortId, contactId } = z.object({ cohortId: id, contactId: id }).parse(raw);
  requireScope(ctx, "academy", "CREATE");
  const h = await db.cohort.findFirst({ where: { id: cohortId, course: academyUnits(ctx, "academy", "CREATE") }, include: { course: true, _count: { select: { enrollments: { where: { state: { not: "WITHDRAWN" } } } } } } });
  if (!h) throw new NotFoundError("Cohort");
  if (h.capacity && h._count.enrollments >= h.capacity) throw new RuleError("This cohort is full");
  if (await db.courseEnrollment.findUnique({ where: { cohortId_contactId: { cohortId, contactId } } })) throw new RuleError("Already in this cohort");
  await db.$transaction(async (tx) => {
    const e = await tx.courseEnrollment.create({ data: { cohortId, contactId, amountDue: h.course.priceNgn } });
    await tx.activity.create({ data: { type: "NOTE", contactId, actorId: ctx.userId, summary: `Applied to ${h.course.title} — ${h.name}`, refType: "enrollment", refId: e.id } });
  });
}

const UpdateInput = z.object({ enrollmentId: id, state: z.enum(STATES).optional(), scholarshipPct: z.coerce.number().int().min(0).max(100).optional(), scholarshipNote: z.string().trim().max(300).optional(), attendancePct: z.coerce.number().min(0).max(100).nullable().optional() });

/** State changes and scholarships; a scholarship recomputes what the student owes and needs a note. */
export async function updateEnrollment(ctx: Ctx, raw: unknown) {
  const input = UpdateInput.parse(raw);
  requireScope(ctx, "academy", "EDIT");
  const e = await db.courseEnrollment.findFirst({ where: { id: input.enrollmentId, cohort: { course: academyUnits(ctx, "academy", "EDIT") } }, include: { cohort: { include: { course: true } } } });
  if (!e) throw new NotFoundError("Enrollment");
  if (input.scholarshipPct != null && input.scholarshipPct > 0 && !input.scholarshipNote && !e.scholarshipNote) throw new RuleError("Record why the scholarship was given");
  const price = e.cohort.course.priceNgn != null ? Number(e.cohort.course.priceNgn) : null;
  const pct = input.scholarshipPct ?? e.scholarshipPct;
  await db.$transaction(async (tx) => {
    await tx.courseEnrollment.update({
      where: { id: e.id },
      data: {
        ...(input.state ? { state: input.state, completedAt: input.state === "COMPLETED" ? (e.completedAt ?? new Date()) : null } : {}),
        ...(input.scholarshipPct != null ? { scholarshipPct: pct, scholarshipNote: input.scholarshipNote ?? e.scholarshipNote, amountDue: price != null ? Math.round(price * (100 - pct)) / 100 : null } : {}),
        ...(input.attendancePct !== undefined ? { attendancePct: input.attendancePct } : {}),
      },
    });
    await audit(tx, { actorId: ctx.userId, action: "enrollment.update", entityType: "CourseEnrollment", entityId: e.id, before: { state: e.state, scholarship: e.scholarshipPct }, after: { state: input.state ?? e.state, scholarship: pct } });
  });
}

// ── certificates ─────────────────────────────────────────────────────────────

export async function issueCertificate(ctx: Ctx, enrollmentId: string): Promise<{ id: string; code: string }> {
  requireScope(ctx, "academy.certificates", "CREATE");
  const e = await db.courseEnrollment.findFirst({ where: { id: enrollmentId, cohort: { course: academyUnits(ctx, "academy.certificates", "CREATE") } }, include: { contact: true, cohort: { include: { course: true } }, certificates: { where: { status: "VALID" } } } });
  if (!e) throw new NotFoundError("Enrollment");
  if (e.state !== "COMPLETED") throw new RuleError("Mark the student as completed first");
  if (e.certificates.length) throw new RuleError("A valid certificate already exists — reissue it instead");
  const cert = await db.$transaction(async (tx) => {
    const c = await tx.certificate.create({ data: { code: certificateCode(), enrollmentId: e.id, recipientName: e.contact.displayName, courseTitle: e.cohort.course.title, cohortName: e.cohort.name, issuedOn: new Date(), issuedById: ctx.userId } });
    await audit(tx, { actorId: ctx.userId, action: "certificate.issue", entityType: "Certificate", entityId: c.id, after: { code: c.code } });
    return c;
  });
  if (e.contact.email) await sendEmail({ to: e.contact.email, subject: `Your Figure Academy certificate: ${cert.courseTitle}`, text: `Congratulations ${cert.recipientName}!\n\nYour certificate for ${cert.courseTitle} (${cert.cohortName}) has been issued. Certificate ID: ${cert.code}. Anyone can verify it online.`, contactId: e.contactId, template: "certificate", cta: { label: "View and verify", url: appUrl(`/verify/${cert.code}`) } });
  return { id: cert.id, code: cert.code };
}

export async function revokeCertificate(ctx: Ctx, raw: unknown) {
  const { certificateId, reason } = z.object({ certificateId: id, reason: z.string().trim().min(5).max(300) }).parse(raw);
  requireScope(ctx, "academy.certificates", "EDIT");
  const c = await db.certificate.findFirst({ where: { id: certificateId, enrollment: { cohort: { course: academyUnits(ctx, "academy.certificates", "EDIT") } } } });
  if (!c) throw new NotFoundError("Certificate");
  if (c.status !== "VALID") throw new RuleError("Only valid certificates can be revoked");
  await db.$transaction(async (tx) => {
    await tx.certificate.update({ where: { id: c.id }, data: { status: "REVOKED", revokedReason: reason, revokedAt: new Date() } });
    await audit(tx, { actorId: ctx.userId, action: "certificate.revoke", entityType: "Certificate", entityId: c.id, after: { reason } });
  });
}

/** Reissue (e.g. name correction): the old code shows as superseded and points to nothing personal. */
export async function reissueCertificate(ctx: Ctx, raw: unknown) {
  const { certificateId, recipientName } = z.object({ certificateId: id, recipientName: z.string().trim().min(3).max(120) }).parse(raw);
  requireScope(ctx, "academy.certificates", "EDIT");
  const c = await db.certificate.findFirst({ where: { id: certificateId, enrollment: { cohort: { course: academyUnits(ctx, "academy.certificates", "EDIT") } } } });
  if (!c) throw new NotFoundError("Certificate");
  if (c.status !== "VALID") throw new RuleError("Only valid certificates can be reissued");
  return db.$transaction(async (tx) => {
    await tx.certificate.update({ where: { id: c.id }, data: { status: "SUPERSEDED" } });
    const n = await tx.certificate.create({ data: { code: certificateCode(), enrollmentId: c.enrollmentId, recipientName, courseTitle: c.courseTitle, cohortName: c.cohortName, issuedOn: new Date(), issuedById: ctx.userId, reissuedFromId: c.id } });
    await audit(tx, { actorId: ctx.userId, action: "certificate.reissue", entityType: "Certificate", entityId: n.id, before: { code: c.code }, after: { code: n.code } });
    return { id: n.id, code: n.code };
  });
}

/** Public verification: only what a certificate itself shows. */
export async function verifyCertificate(code: string) {
  const norm = code.trim().toUpperCase();
  if (!/^FA-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/.test(norm)) return null;
  const c = await db.certificate.findUnique({ where: { code: norm } });
  if (!c) return null;
  return { code: c.code, status: c.status, recipientName: c.status === "SUPERSEDED" ? null : c.recipientName, courseTitle: c.courseTitle, cohortName: c.cohortName, issuedOn: c.issuedOn.toISOString().slice(0, 10), revokedReason: c.status === "REVOKED" ? "Revoked by Figure Academy" : null };
}

export async function certificatePdf(ctx: Ctx, certificateId: string): Promise<{ filename: string; base64: string }> {
  if (!scopeOf(ctx, "academy.certificates", "VIEW")) throw new NotFoundError("Certificate");
  const c = await db.certificate.findFirst({ where: { id: certificateId, enrollment: { cohort: { course: academyUnits(ctx, "academy.certificates", "VIEW") } } } });
  if (!c) throw new NotFoundError("Certificate");
  const url = appUrl(`/verify/${c.code}`);
  const d = await Doc.create(`Certificate ${c.code}`);
  const page = d.pdf.getPages()[0]!;
  page.setSize(A4.h, A4.w); // landscape
  const W = A4.h;
  const H = A4.w;
  page.drawRectangle({ x: 24, y: 24, width: W - 48, height: H - 48, borderColor: ACCENT, borderWidth: 2 });
  const centre = (t: string, y: number, size: number, bold = false, color = MUTED) => {
    const f = bold ? d.bold : d.font;
    page.drawText(t, { x: (W - f.widthOfTextAtSize(t, size)) / 2, y, size, font: f, color });
  };
  centre("FIGURE ACADEMY", H - 110, 14, true, ACCENT);
  centre("Certificate of Completion", H - 150, 26, true, undefined);
  centre("This certifies that", H - 200, 12);
  centre(c.recipientName, H - 245, 30, true, undefined);
  centre("has successfully completed", H - 285, 12);
  centre(c.courseTitle, H - 320, 18, true, undefined);
  centre(`${c.cohortName} · issued ${fmtDate(c.issuedOn)}`, H - 345, 11);
  const png = await QRCode.toBuffer(url, { margin: 0, width: 240, errorCorrectionLevel: "M" });
  const img = await d.pdf.embedPng(png);
  page.drawImage(img, { x: W - M - 90, y: 56, width: 90, height: 90 });
  page.drawText(`Verify: ${url}`, { x: M + 10, y: 70, size: 9, font: d.font, color: MUTED });
  page.drawText(`Certificate ID ${c.code}`, { x: M + 10, y: 56, size: 9, font: d.bold, color: MUTED });
  return { filename: `${c.code}.pdf`, base64: Buffer.from(await d.bytes()).toString("base64") };
}
