import "server-only";
import type { ContractKind, Prisma } from "@prisma/client";
import { z } from "zod";
import { contentHash } from "@/domain/hr/content-hash";
import { namesMatch, renderTemplate, unknownFields, type MergeField } from "@/domain/hr/merge";
import { audit } from "@/server/audit/audit";
import { can, requireScope, type Ctx } from "@/server/authz/context";
import { ForbiddenError, NotFoundError, RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { notify } from "@/server/notify/notify";
import { A4, Doc, fmtDate, M, MUTED } from "@/server/pdf/kit";
import { toRule, policyFor } from "./deductions-service";

const id = z.string().cuid();
type Tx = Prisma.TransactionClient;
const KINDS = ["EMPLOYMENT", "NDA", "IP_ASSIGNMENT", "NON_SOLICITATION", "ATTENDANCE_POLICY", "CODE_OF_CONDUCT", "DATA_PROTECTION", "PROPERTY_RETURN", "ADDENDUM", "RESIGNATION_ACCEPTANCE", "TERMINATION_LETTER", "OFFER_LETTER"] as const;
const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── templates ────────────────────────────────────────────────────────────────

export async function listTemplates(ctx: Ctx) {
  requireScope(ctx, "hr.contracts", "VIEW");
  const rows = await db.contractTemplate.findMany({ orderBy: [{ kind: "asc" }, { version: "desc" }] });
  return rows.map((t) => ({ id: t.id, kind: t.kind, version: t.version, title: t.title, body: t.body, status: t.status, inPack: t.inPack, lawyerReviewedAt: t.lawyerReviewedAt?.toISOString() ?? null, lawyerName: t.lawyerName, createdAt: t.createdAt.toISOString() }));
}

/** Saving never edits a template in place: it adds a new draft version (signed contracts keep their frozen text). */
export async function saveTemplate(ctx: Ctx, raw: unknown) {
  const input = z.object({ kind: z.enum(KINDS), title: z.string().trim().min(3).max(120), body: z.string().trim().min(20).max(60_000), inPack: z.boolean().default(true) }).parse(raw);
  requireScope(ctx, "hr.contracts", "EDIT");
  const bad = unknownFields(input.body);
  if (bad.length) throw new RuleError(`Unknown merge field${bad.length > 1 ? "s" : ""}: ${bad.map((b) => `{{${b}}}`).join(", ")}`);
  await db.$transaction(async (tx) => {
    const last = await tx.contractTemplate.findFirst({ where: { kind: input.kind }, orderBy: { version: "desc" } });
    const t = await tx.contractTemplate.create({ data: { ...input, version: (last?.version ?? 0) + 1, status: "draft" } });
    await audit(tx, { actorId: ctx.userId, action: "contract_template.create", entityType: "ContractTemplate", entityId: t.id, after: { kind: t.kind, version: t.version } });
  });
}

/** Approve a version for use (after legal review); the previously approved version retires. */
export async function approveTemplate(ctx: Ctx, raw: unknown) {
  const { templateId, lawyerName } = z.object({ templateId: id, lawyerName: z.string().trim().max(120).optional() }).parse(raw);
  if (!can(ctx, "hr.contracts", "APPROVE") && !can(ctx, "hr.contracts", "EDIT")) throw new ForbiddenError("hr.contracts:APPROVE");
  const t = await db.contractTemplate.findUnique({ where: { id: templateId } });
  if (!t) throw new NotFoundError("Template");
  if (t.status !== "draft") throw new RuleError("Only drafts can be approved");
  await db.$transaction(async (tx) => {
    await tx.contractTemplate.updateMany({ where: { kind: t.kind, status: "approved" }, data: { status: "retired" } });
    await tx.contractTemplate.update({ where: { id: t.id }, data: { status: "approved", lawyerName: lawyerName || null, lawyerReviewedAt: lawyerName ? new Date() : null } });
    await audit(tx, { actorId: ctx.userId, action: "contract_template.approve", entityType: "ContractTemplate", entityId: t.id, after: { kind: t.kind, version: t.version, lawyer: lawyerName ?? null } });
  });
}

// ── rendering ────────────────────────────────────────────────────────────────

async function mergeValues(tx: Tx, userId: string, extra: Partial<Record<MergeField, string>> = {}): Promise<Partial<Record<MergeField, string>>> {
  const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { staffProfile: true, primaryUnit: { select: { name: true } } } });
  const p = u.staffProfile;
  if (!p) throw new RuleError(`Create ${u.name}'s staff profile first`);
  const month = new Date().toISOString().slice(0, 7);
  const policy = await policyFor(tx, userId, month);
  const r = policy ? toRule(policy) : null;
  const summary = r
    ? [
        r.latenessMode === "FIXED" ? `Each late arrival: NGN ${r.fixedAmount?.toLocaleString("en-NG")}.` : `Lateness tiers: ${r.tiers.map((t) => `${t.fromMinutes}${t.toMinutes ? `-${t.toMinutes}` : "+"} min NGN ${t.amount.toLocaleString("en-NG")}`).join("; ")}.`,
        r.earlyLeaveAmount ? `Signing off before ${p.closeTime}: NGN ${r.earlyLeaveAmount.toLocaleString("en-NG")} per day.` : null,
        r.absenceMode === "DAILY_RATE" ? "Unexcused absence: one day's pay." : `Unexcused absence: NGN ${r.absenceAmount?.toLocaleString("en-NG")}.`,
        r.monthlyCapAmount != null || r.monthlyCapPct != null ? `Monthly cap: ${[r.monthlyCapAmount != null ? `NGN ${r.monthlyCapAmount.toLocaleString("en-NG")}` : null, r.monthlyCapPct != null ? `${r.monthlyCapPct}% of gross` : null].filter(Boolean).join(" or ")}, whichever is lower.` : null,
        r.monthlyCapAmount == null && r.monthlyCapPct == null ? "There is no monthly limit on these deductions." : null,
        p.graceMinutes > 0 ? `Grace period: ${p.graceMinutes} minutes.` : `Work starts at ${p.resumeTime}: arriving at any time after ${p.resumeTime} is late.`,
        "Approved leave, approved excuses and public holidays are never deducted.",
      ].filter(Boolean).join(" ")
    : "As set out in the Attendance & Lateness Policy.";
  const d = (x: Date | null) => (x ? fmtDate(x) : "");
  return {
    "staff.name": u.name,
    "staff.email": u.email,
    "staff.jobTitle": p.jobTitle,
    "staff.employeeNo": p.employeeNo,
    "staff.employmentType": p.employmentType.replace("_", " ").toLowerCase(),
    "staff.startDate": d(p.startDate),
    "staff.probationEnds": d(p.probationEnds),
    "staff.resumeTime": p.resumeTime,
    "staff.closeTime": p.closeTime,
    "staff.workingDays": p.workingDays.map((w) => DAY_NAMES[w]).join(", "),
    "unit.name": u.primaryUnit?.name ?? "Figuraid",
    "company.name": "Figuraid Ltd",
    "company.address": process.env.COMPANY_ADDRESS ?? "",
    "policy.summary": summary,
    today: fmtDate(new Date()),
    ...extra,
  };
}

async function createDocs(tx: Tx, ctx: Ctx, userId: string, packId: string, templates: { id: string; kind: ContractKind; title: string; body: string }[], extra: Partial<Record<MergeField, string>> = {}) {
  const u = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const values = await mergeValues(tx, userId, extra);
  const countersigner = await tx.user.findFirst({ where: { status: "ACTIVE", role: { key: "super_admin" } }, orderBy: { createdAt: "asc" } });
  for (const t of templates) {
    const text = renderTemplate(t.body, values);
    await tx.document.create({
      data: {
        title: t.title,
        category: t.kind === "NDA" ? "NDA" : t.kind === "OFFER_LETTER" ? "OFFER_LETTER" : t.kind === "ATTENDANCE_POLICY" || t.kind === "CODE_OF_CONDUCT" || t.kind === "DATA_PROTECTION" ? "POLICY" : "STAFF_CONTRACT",
        status: "AWAITING_SIGNATURE",
        unitId: u.primaryUnitId,
        renderedBody: text,
        contentHash: contentHash(text),
        templateId: t.id,
        packId,
        staffUserId: userId,
        uploadedById: ctx.userId,
        effectiveOn: new Date(),
        restrictedTo: ["super_admin", "admin", "hr"],
        signatures: {
          create: [
            { role: "STAFF", order: 1, signerId: userId, signerName: u.name, signerEmail: u.email },
            ...(countersigner ? [{ role: "COMPANY" as const, order: 2, signerId: countersigner.id, signerName: countersigner.name, signerEmail: countersigner.email }] : []),
          ],
        },
      },
    });
  }
}

// ── packs ────────────────────────────────────────────────────────────────────

/** Generate and send the onboarding pack from the approved templates. Work modules stay locked until it's signed. */
export async function generatePack(ctx: Ctx, raw: unknown): Promise<{ id: string; documents: number }> {
  const { userId } = z.object({ userId: id }).parse(raw);
  requireScope(ctx, "hr.contracts", "CREATE");
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u) throw new NotFoundError("Staff member");
  if (!["INVITED", "ONBOARDING"].includes(u.status)) throw new RuleError("Onboarding packs are for new joiners — use an addendum for existing staff");
  const templates = (await db.contractTemplate.findMany({ where: { status: "approved", inPack: true, kind: { notIn: ["ADDENDUM", "RESIGNATION_ACCEPTANCE", "TERMINATION_LETTER"] } }, orderBy: { kind: "asc" } }));
  if (!templates.length) throw new RuleError("Approve at least one contract template first");
  const pack = await db.$transaction(async (tx) => {
    const old = await tx.contractPack.findMany({ where: { userId, purpose: "onboarding", status: { in: ["GENERATED", "SENT"] } }, select: { id: true } });
    if (old.length) {
      await tx.contractPack.updateMany({ where: { id: { in: old.map((o) => o.id) } }, data: { status: "VOID" } });
      await tx.document.updateMany({ where: { packId: { in: old.map((o) => o.id) } }, data: { status: "ARCHIVED" } });
    }
    const p = await tx.contractPack.create({ data: { userId, purpose: "onboarding", status: "SENT", sentAt: new Date() } });
    await createDocs(tx, ctx, userId, p.id, templates);
    await audit(tx, { actorId: ctx.userId, action: "contract_pack.generate", entityType: "ContractPack", entityId: p.id, after: { user: userId, documents: templates.length, versions: templates.map((t) => `${t.kind}@${t.version}`) } });
    return p;
  });
  await notify({ userIds: [userId], type: "contracts.sign", title: "Your contract pack is ready to sign", body: `${templates.length} documents. Read each one and sign to unlock the rest of Figuraid OS.`, link: "/me/documents", email: true });
  return { id: pack.id, documents: templates.length };
}

export async function issueAddendum(ctx: Ctx, raw: unknown) {
  const { userId, title, body } = z.object({ userId: id, title: z.string().trim().min(3).max(120), body: z.string().trim().min(10).max(20_000) }).parse(raw);
  requireScope(ctx, "hr.contracts", "CREATE");
  const template = await db.contractTemplate.findFirst({ where: { kind: "ADDENDUM", status: "approved" } });
  if (!template) throw new RuleError("Approve an addendum template first");
  const p = await db.$transaction(async (tx) => {
    const pack = await tx.contractPack.create({ data: { userId, purpose: "addendum", status: "SENT", sentAt: new Date() } });
    await createDocs(tx, ctx, userId, pack.id, [{ ...template, title }], { "addendum.body": body });
    await audit(tx, { actorId: ctx.userId, action: "contract.addendum", entityType: "ContractPack", entityId: pack.id, after: { user: userId, title } });
    return pack;
  });
  await notify({ userIds: [userId], type: "contracts.sign", title: `Please sign: ${title}`, link: "/me/documents", email: true });
  return { id: p.id };
}

/** Documents a person must sign (or has signed), plus HR's countersign queue. */
export async function myDocuments(ctx: Ctx) {
  const docs = await db.document.findMany({
    where: { OR: [{ staffUserId: ctx.userId }, { signatures: { some: { signerId: ctx.userId } } }], status: { not: "ARCHIVED" }, packId: { not: null } },
    include: { signatures: { orderBy: { order: "asc" } }, pack: { select: { purpose: true, status: true } }, staffUser: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return docs.map((d) => {
    const mine = d.signatures.find((s) => s.signerId === ctx.userId && s.status === "pending");
    const blocked = mine ? d.signatures.some((s) => s.order < mine.order && s.status !== "signed") : false;
    return { id: d.id, title: d.title, staff: d.staffUser?.name ?? null, status: d.status, purpose: d.pack?.purpose ?? null, createdAt: d.createdAt.toISOString(), mustSign: !!mine && !blocked, waitingOn: blocked ? "staff" : null, signatures: d.signatures.map((s) => ({ role: s.role, name: s.signerName, status: s.status, signedAt: s.signedAt?.toISOString() ?? null })) };
  });
}

async function readableDoc(ctx: Ctx, documentId: string) {
  const d = await db.document.findUnique({ where: { id: documentId }, include: { signatures: { orderBy: { order: "asc" } }, pack: true } });
  if (!d || !d.renderedBody) throw new NotFoundError("Document");
  const party = d.staffUserId === ctx.userId || d.signatures.some((s) => s.signerId === ctx.userId);
  if (!party && !can(ctx, "hr.contracts", "VIEW")) throw new NotFoundError("Document");
  return d;
}

export async function getDocument(ctx: Ctx, documentId: string) {
  const d = await readableDoc(ctx, documentId);
  await db.documentAccessLog.create({ data: { documentId: d.id, userId: ctx.userId, action: "view" } });
  const mine = d.signatures.find((s) => s.signerId === ctx.userId && s.status === "pending");
  return {
    id: d.id,
    title: d.title,
    body: d.renderedBody!,
    status: d.status,
    contentHash: d.contentHash,
    canSign: !!mine && !d.signatures.some((s) => s.order < mine.order && s.status !== "signed") && d.status !== "ARCHIVED",
    signAs: mine?.role ?? null,
    signatures: d.signatures.map((s) => ({ role: s.role, name: s.signerName, status: s.status, signedAt: s.signedAt?.toISOString() ?? null, typedName: s.typedName })),
  };
}

/**
 * In-app e-signature: typed full name + consent, bound to the SHA-256 of the exact text
 * shown, with time, IP and device. Staff signing the whole pack moves them to ACTIVE.
 */
export async function signDocument(ctx: Ctx, raw: unknown, meta: { ip: string | null; userAgent: string | null }) {
  const input = z.object({ documentId: id, typedName: z.string().trim().min(3).max(120), contentHash: z.string().regex(/^[0-9a-f]{64}$/), agree: z.literal(true) }).parse(raw);
  const d = await readableDoc(ctx, input.documentId);
  if (d.status === "ARCHIVED" || d.pack?.status === "VOID") throw new RuleError("This document was replaced — open the latest version");
  const sig = d.signatures.find((s) => s.signerId === ctx.userId && s.status === "pending");
  if (!sig) throw new RuleError("Nothing for you to sign here");
  if (d.signatures.some((s) => s.order < sig.order && s.status !== "signed")) throw new RuleError("The staff member hasn't signed yet");
  if (contentHash(d.renderedBody!) !== d.contentHash) throw new Error(`Document ${d.id} failed its integrity check`);
  if (input.contentHash !== d.contentHash) throw new RuleError("The document changed while you were reading it — reload and read it again");
  if (!namesMatch(input.typedName, ctx.name)) throw new RuleError(`Type your full name exactly as "${ctx.name}"`);

  const result = await db.$transaction(async (tx) => {
    await tx.signature.update({ where: { id: sig.id }, data: { status: "signed", signedAt: new Date(), typedName: input.typedName, contentHash: d.contentHash, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null } });
    const remaining = await tx.signature.count({ where: { documentId: d.id, status: { not: "signed" } } });
    await tx.document.update({ where: { id: d.id }, data: { status: remaining ? "PARTIALLY_SIGNED" : "SIGNED" } });
    await audit(tx, { actorId: ctx.userId, action: "document.sign", entityType: "Document", entityId: d.id, after: { role: sig.role, hash: d.contentHash } });
    if (!d.packId) return { activated: false, packDone: false };
    const pending = await tx.signature.count({ where: { document: { packId: d.packId }, status: "pending" } });
    const staffPending = await tx.signature.count({ where: { document: { packId: d.packId }, role: "STAFF", status: "pending" } });
    let activated = false;
    if (staffPending === 0 && d.pack!.status === "SENT") {
      await tx.contractPack.update({ where: { id: d.packId }, data: { status: pending ? "STAFF_SIGNED" : "COMPLETED", completedAt: pending ? null : new Date() } });
      if (d.pack!.purpose === "onboarding") {
        const u = await tx.user.findUniqueOrThrow({ where: { id: d.pack!.userId } });
        if (u.status === "ONBOARDING") {
          await tx.user.update({ where: { id: u.id }, data: { status: "ACTIVE" } });
          await tx.staffProfile.updateMany({ where: { userId: u.id }, data: { onboardedAt: new Date() } });
          await audit(tx, { actorId: u.id, action: "user.activated", entityType: "User", entityId: u.id, after: { via: "contract_pack", pack: d.packId } });
          activated = true;
        }
      }
    } else if (pending === 0) {
      await tx.contractPack.update({ where: { id: d.packId }, data: { status: "COMPLETED", completedAt: new Date() } });
    }
    return { activated, packDone: pending === 0, packId: d.packId, staffDone: staffPending === 0 };
  });
  if (result.activated) {
    const hr = await db.user.findMany({ where: { status: "ACTIVE", role: { key: { in: ["hr", "super_admin"] } } }, select: { id: true } });
    await notify({ userIds: hr.map((h) => h.id), type: "contracts.signed", title: `${ctx.name} signed their contract pack`, body: "Their account is now active. Countersign from Team → Staff.", link: `/team/staff/${ctx.userId}` });
  }
  return result;
}

/** Signed copy with the evidence trail (generated on demand from the frozen text). */
export async function renderSignedPdf(ctx: Ctx, documentId: string): Promise<{ filename: string; base64: string }> {
  const d = await readableDoc(ctx, documentId);
  const doc = await Doc.create(d.title);
  doc.header("Figuraid Ltd", "");
  doc.text(d.title, M, { size: 15, bold: true });
  doc.y -= 24;
  doc.para(d.renderedBody!.replace(/^#+\s*/gm, "").replace(/\*\*/g, ""), M, A4.w - 2 * M, { size: 10 });
  doc.y -= 16;
  doc.ensure(40 + d.signatures.length * 34);
  doc.rule();
  doc.y -= 16;
  doc.text("SIGNATURES", M, { size: 8, bold: true, color: MUTED });
  doc.y -= 16;
  for (const s of d.signatures) {
    doc.text(`${s.role === "STAFF" ? "Staff member" : s.role === "COMPANY" ? "For Figuraid Ltd" : "Counterparty"}: ${s.signerName}`, M, { size: 10, bold: true });
    doc.y -= 13;
    doc.text(s.status === "signed" ? `Signed "${s.typedName}" on ${s.signedAt!.toISOString()} from ${s.ip ?? "unknown IP"}` : "Not yet signed", M, { size: 8.5, color: MUTED });
    doc.y -= 20;
  }
  doc.footer([`Document ${d.id} · SHA-256 ${d.contentHash}`, "Signed electronically in Figuraid OS. Each signature is bound to the hash of the exact text above."]);
  await db.documentAccessLog.create({ data: { documentId: d.id, userId: ctx.userId, action: "download" } });
  return { filename: `${d.title.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`, base64: Buffer.from(await doc.bytes()).toString("base64") };
}

/** Daily job: remind people with unsigned packs every 2 days, up to 5 times, then tell HR. */
export async function remindUnsignedPacks(now = new Date()): Promise<number> {
  const packs = await db.contractPack.findMany({ where: { status: "SENT", OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: new Date(now.getTime() - 2 * 86_400_000) } }], sentAt: { lt: new Date(now.getTime() - 86_400_000) } }, include: { user: { select: { id: true, name: true } } } });
  const hr = await db.user.findMany({ where: { status: "ACTIVE", role: { key: "hr" } }, select: { id: true } });
  for (const p of packs) {
    if (p.reminderCount >= 5) {
      if (p.reminderCount === 5) await notify({ userIds: hr.map((h) => h.id), type: "contracts.overdue", title: `${p.user.name} still hasn't signed their contracts`, link: `/team/staff/${p.user.id}` });
    } else await notify({ userIds: [p.userId], type: "contracts.reminder", title: "Reminder: please sign your contracts", link: "/me/documents", email: true });
    await db.contractPack.update({ where: { id: p.id }, data: { lastReminderAt: now, reminderCount: { increment: 1 } } });
  }
  return packs.length;
}

export async function staffPacks(ctx: Ctx, userId: string) {
  requireScope(ctx, "hr.contracts", "VIEW");
  const packs = await db.contractPack.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, include: { documents: { include: { signatures: { orderBy: { order: "asc" } } }, orderBy: { createdAt: "asc" } } } });
  return packs.map((pk) => ({
    id: pk.id,
    purpose: pk.purpose,
    status: pk.status,
    sentAt: pk.sentAt?.toISOString() ?? null,
    reminderCount: pk.reminderCount,
    documents: pk.documents.map((d) => ({ id: d.id, title: d.title, status: d.status, signatures: d.signatures.map((s) => ({ role: s.role, status: s.status })) })),
  }));
}
