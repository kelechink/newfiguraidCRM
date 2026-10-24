import "server-only";
import type { PolicyKind } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/server/audit/audit";
import { requireScope, type Ctx } from "@/server/authz/context";
import { NotFoundError, RuleError } from "@/server/authz/errors";
import { requireRecentAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { sendEmail } from "@/server/email/send";
import { notify } from "@/server/notify/notify";
import { getSetting } from "@/server/modules/settings/service";

const id = z.string().cuid();
const KINDS = ["STAFF_PRIVACY", "PUBLIC_PRIVACY", "WEBCHAT_NOTICE", "WHATSAPP_NOTICE", "FORM_NOTICE", "ACCEPTABLE_USE"] as const;

// ── policy documents ─────────────────────────────────────────────────────────

export async function publishedPolicy(kind: PolicyKind) {
  const p = await db.policyDocument.findFirst({ where: { kind, publishedAt: { not: null, lte: new Date() } }, orderBy: { publishedAt: "desc" } });
  return p ? { id: p.id, title: p.title, body: p.body, version: p.version, publishedAt: p.publishedAt!.toISOString() } : null;
}

export async function listPolicies(ctx: Ctx) {
  requireScope(ctx, "settings", "VIEW");
  const rows = await db.policyDocument.findMany({ orderBy: [{ kind: "asc" }, { createdAt: "desc" }], include: { _count: { select: { acceptances: true } } } });
  return rows.map((p) => ({ id: p.id, kind: p.kind, version: p.version, title: p.title, body: p.body, publishedAt: p.publishedAt?.toISOString() ?? null, lawyerReviewedAt: p.lawyerReviewedAt?.toISOString() ?? null, acceptances: p._count.acceptances }));
}

/** New version of a notice. Publishing the staff notice makes everyone accept it again at next sign-in. */
export async function savePolicy(ctx: Ctx, raw: unknown) {
  const input = z.object({ kind: z.enum(KINDS), title: z.string().trim().min(3).max(160), body: z.string().trim().min(50).max(100_000), publish: z.boolean().default(false), lawyerReviewed: z.boolean().default(false) }).parse(raw);
  requireScope(ctx, "settings", "EDIT");
  const version = `${new Date().toISOString().slice(0, 10)}.${(await db.policyDocument.count({ where: { kind: input.kind, version: { startsWith: new Date().toISOString().slice(0, 10) } } })) + 1}`;
  await db.$transaction(async (tx) => {
    const p = await tx.policyDocument.create({ data: { kind: input.kind, title: input.title, body: input.body, version, publishedAt: input.publish ? new Date() : null, lawyerReviewedAt: input.lawyerReviewed ? new Date() : null } });
    await audit(tx, { actorId: ctx.userId, action: input.publish ? "policy.publish" : "policy.draft", entityType: "PolicyDocument", entityId: p.id, after: { kind: input.kind, version } });
  });
}

export async function publishPolicy(ctx: Ctx, policyId: string) {
  requireScope(ctx, "settings", "EDIT");
  const p = await db.policyDocument.findUnique({ where: { id: policyId } });
  if (!p) throw new NotFoundError("Policy");
  if (p.publishedAt) throw new RuleError("Already published");
  await db.$transaction(async (tx) => {
    await tx.policyDocument.update({ where: { id: p.id }, data: { publishedAt: new Date() } });
    await audit(tx, { actorId: ctx.userId, action: "policy.publish", entityType: "PolicyDocument", entityId: p.id, after: { kind: p.kind, version: p.version } });
  });
}

// ── data subject requests (NDPA 2023) ────────────────────────────────────────

const PublicDsr = z.object({
  type: z.enum(["ACCESS", "CORRECTION", "DELETION", "OBJECTION", "PORTABILITY", "RESTRICTION"]),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  details: z.string().trim().max(3000).optional(),
});

/** Public form. We never confirm whether a person is in our records until identity is verified. */
export async function submitDsr(raw: unknown) {
  const input = PublicDsr.parse(raw);
  if (!input.email && !input.phone) throw new RuleError("Give an email or phone number so we can verify it's you");
  const days = Number(await getSetting("privacy.dsr_days"));
  const r = await db.$transaction(async (tx) => {
    const row = await tx.dataSubjectRequest.create({ data: { type: input.type, requesterName: input.name, requesterEmail: input.email || null, requesterPhone: input.phone || null, details: input.details || null, dueAt: new Date(Date.now() + days * 86_400_000) } });
    await audit(tx, { actorId: null, actorType: "external", action: "dsr.received", entityType: "DataSubjectRequest", entityId: row.id, after: { type: input.type } });
    return row;
  });
  const dpo = await db.user.findMany({ where: { status: "ACTIVE", role: { key: { in: ["super_admin", "admin"] } } }, select: { id: true } });
  await notify({ userIds: dpo.map((d) => d.id), type: "dsr.received", title: `New data ${input.type.toLowerCase()} request`, body: `Due ${r.dueAt.toDateString()}`, link: "/settings/privacy", email: true });
  if (input.email) await sendEmail({ to: input.email, subject: "We've received your data request", text: `Hello ${input.name},\n\nWe've received your ${input.type.toLowerCase()} request (reference ${r.id.slice(-8).toUpperCase()}). We'll verify your identity and respond within ${days} days. Contact: ${await getSetting("dpo.contact")}.`, template: "dsr_receipt" });
  return { reference: r.id.slice(-8).toUpperCase() };
}

export async function listDsrs(ctx: Ctx) {
  requireScope(ctx, "privacy.dsr", "VIEW");
  const rows = await db.dataSubjectRequest.findMany({ include: { contact: { select: { id: true, displayName: true } }, assignee: { select: { name: true } } }, orderBy: [{ completedAt: { sort: "asc", nulls: "first" } }, { dueAt: "asc" }], take: 200 });
  const now = Date.now();
  return rows.map((r) => ({ id: r.id, reference: r.id.slice(-8).toUpperCase(), type: r.type, status: r.status, name: r.requesterName, email: r.requesterEmail, phone: r.requesterPhone, details: r.details, contact: r.contact, assignee: r.assignee?.name ?? null, receivedAt: r.receivedAt.toISOString(), dueAt: r.dueAt.toISOString(), daysLeft: Math.ceil((r.dueAt.getTime() - now) / 86_400_000), verified: !!r.identityVerifiedAt, resolution: r.resolution }));
}

/** Possible matches for a request, only after identity is verified. */
export async function dsrMatches(ctx: Ctx, dsrId: string) {
  requireScope(ctx, "privacy.dsr", "EDIT");
  const r = await db.dataSubjectRequest.findUnique({ where: { id: dsrId } });
  if (!r) throw new NotFoundError("Request");
  if (!r.identityVerifiedAt) throw new RuleError("Verify the requester's identity first");
  const phone = r.requesterPhone?.replace(/\D/g, "");
  const rows = await db.contact.findMany({ where: { deletedAt: null, OR: [...(r.requesterEmail ? [{ emailNormalized: r.requesterEmail }] : []), ...(phone && phone.length >= 7 ? [{ phoneE164: { endsWith: phone.slice(-10) } }] : [])] }, select: { id: true, displayName: true, email: true, phoneE164: true, unit: { select: { name: true } } }, take: 10 });
  return rows.map((c) => ({ id: c.id, name: c.displayName, email: c.email, phone: c.phoneE164, unit: c.unit.name }));
}

export async function updateDsr(ctx: Ctx, raw: unknown) {
  const input = z.object({ dsrId: id, status: z.enum(["RECEIVED", "VERIFYING_IDENTITY", "IN_PROGRESS", "COMPLETED", "REJECTED"]).optional(), verified: z.boolean().optional(), contactId: id.nullable().optional(), resolution: z.string().trim().max(3000).optional() }).parse(raw);
  requireScope(ctx, "privacy.dsr", "EDIT");
  const r = await db.dataSubjectRequest.findUnique({ where: { id: input.dsrId } });
  if (!r) throw new NotFoundError("Request");
  if ((input.status === "COMPLETED" || input.status === "REJECTED") && !input.resolution && !r.resolution) throw new RuleError("Record what was done and how the person was told");
  if (input.status === "COMPLETED" && !r.identityVerifiedAt && !input.verified) throw new RuleError("Identity must be verified before completing");
  await db.$transaction(async (tx) => {
    await tx.dataSubjectRequest.update({
      where: { id: r.id },
      data: {
        ...(input.status ? { status: input.status, completedAt: ["COMPLETED", "REJECTED"].includes(input.status) ? new Date() : null } : {}),
        ...(input.verified ? { identityVerifiedAt: r.identityVerifiedAt ?? new Date() } : {}),
        ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
        ...(input.resolution ? { resolution: input.resolution } : {}),
        assigneeId: r.assigneeId ?? ctx.userId,
      },
    });
    await audit(tx, { actorId: ctx.userId, action: "dsr.update", entityType: "DataSubjectRequest", entityId: r.id, before: { status: r.status }, after: { status: input.status ?? r.status, verified: input.verified ?? !!r.identityVerifiedAt } });
  });
}

/** Everything we hold about a contact, as JSON (access and portability requests). */
export async function exportContactData(ctx: Ctx, dsrId: string): Promise<{ filename: string; json: string }> {
  requireScope(ctx, "privacy.dsr", "EDIT");
  const r = await db.dataSubjectRequest.findUnique({ where: { id: dsrId } });
  if (!r?.contactId || !r.identityVerifiedAt) throw new RuleError("Verify identity and link the matching contact first");
  await requireRecentAuth(ctx);
  const c = await db.contact.findUniqueOrThrow({
    where: { id: r.contactId },
    include: {
      company: { select: { name: true } },
      activities: { select: { type: true, summary: true, occurredAt: true } },
      deals: { select: { title: true, value: true, status: true, createdAt: true } },
      consents: { select: { channel: true, granted: true, source: true, createdAt: true } },
      formSubmissions: { select: { data: true, createdAt: true } },
      conversations: { select: { channel: true, createdAt: true, messages: { select: { direction: true, body: true, sentAt: true } } } },
      invoices: { select: { number: true, total: true, currency: true, status: true, issueDate: true } },
      tickets: { select: { number: true, subject: true, status: true, createdAt: true } },
      studentEnrollments: { select: { state: true, createdAt: true, cohort: { select: { name: true } } } },
    },
  });
  const { id: _id, unitId: _u, ownerId: _o, companyId: _c, campaignId: _ca, formId: _f, mergedIntoId: _m, ...profile } = c;
  await db.$transaction((tx) => audit(tx, { actorId: ctx.userId, action: "dsr.export", entityType: "Contact", entityId: c.id, after: { dsr: r.id } }));
  return { filename: `data-export-${r.id.slice(-8).toUpperCase()}.json`, json: JSON.stringify({ exportedAt: new Date().toISOString(), controller: "Figuraid Ltd", ...profile }, null, 2) };
}

/**
 * Erasure: personal data is removed from the contact, its messages and form answers.
 * Invoices and payments stay (tax law requires keeping them) but no longer name the person.
 */
export async function eraseContact(ctx: Ctx, dsrId: string) {
  requireScope(ctx, "privacy.dsr", "EDIT");
  const r = await db.dataSubjectRequest.findUnique({ where: { id: dsrId } });
  if (!r?.contactId || !r.identityVerifiedAt) throw new RuleError("Verify identity and link the matching contact first");
  if (r.type !== "DELETION") throw new RuleError("Erasure is only for deletion requests");
  await requireRecentAuth(ctx);
  const contactId = r.contactId;
  await anonymiseContact(contactId, `Erased (DSR ${r.id.slice(-8).toUpperCase()})`);
  await db.$transaction(async (tx) => {
    await tx.dataSubjectRequest.update({ where: { id: r.id }, data: { status: "COMPLETED", completedAt: new Date(), resolution: r.resolution ?? "Personal data erased; financial records kept without personal details as required by law." } });
    await audit(tx, { actorId: ctx.userId, action: "dsr.erase", entityType: "Contact", entityId: contactId, after: { dsr: r.id } });
  });
}

export async function anonymiseContact(contactId: string, label = "Anonymised contact") {
  await db.$transaction(async (tx) => {
    await tx.contact.update({ where: { id: contactId }, data: { firstName: null, lastName: null, displayName: label, email: null, emailNormalized: null, phone: null, phoneE164: null, whatsappId: null, instagramId: null, facebookPsid: null, linkedinId: null, budget: null, utmSource: null, utmMedium: null, utmCampaign: null, referralCode: null, lifecycle: "ARCHIVED", deletedAt: new Date() } });
    await tx.message.updateMany({ where: { conversation: { contactId } }, data: { body: "[erased]" } });
    await tx.formSubmission.updateMany({ where: { contactId }, data: { data: {}, ip: null } });
    await tx.activity.updateMany({ where: { contactId }, data: { summary: "[erased]" } });
    await tx.consent.deleteMany({ where: { contactId } });
  });
}

// ── retention ────────────────────────────────────────────────────────────────

export async function listRetention(ctx: Ctx) {
  requireScope(ctx, "settings", "VIEW");
  return db.retentionRule.findMany({ orderBy: { entity: "asc" } });
}

/** Nightly: apply retention rules. Leads never converted are anonymised after the window. */
export async function runRetention(now = new Date()): Promise<Record<string, number>> {
  const rules = await db.retentionRule.findMany({ where: { isActive: true } });
  const out: Record<string, number> = {};
  for (const rule of rules) {
    const before = new Date(now.getTime() - rule.afterDays * 86_400_000);
    let n = 0;
    if (rule.entity === "contact_lead") {
      const stale = await db.contact.findMany({ where: { deletedAt: null, lifecycle: { in: ["LEAD", "ARCHIVED"] }, OR: [{ lastActivityAt: { lt: before } }, { lastActivityAt: null, createdAt: { lt: before } }], deals: { none: { status: "WON" } }, invoices: { none: {} } }, select: { id: true }, take: 500 });
      for (const c of stale) await anonymiseContact(c.id);
      n = stale.length;
    } else if (rule.entity === "webhook_event") {
      n = (await db.webhookEvent.deleteMany({ where: { receivedAt: { lt: before } } }).catch(() => ({ count: 0 }))).count;
    } else if (rule.entity === "login_attempt") {
      n = (await db.loginAttempt.deleteMany({ where: { createdAt: { lt: before } } }).catch(() => ({ count: 0 }))).count;
    }
    await db.retentionRule.update({ where: { id: rule.id }, data: { lastRunAt: now } });
    out[rule.entity] = n;
  }
  if (Object.values(out).some((n) => n > 0)) await db.$transaction((tx) => audit(tx, { actorId: null, actorType: "system", action: "retention.run", entityType: "RetentionRule", entityId: "nightly", after: out }));
  return out;
}

export async function dueDsrAlerts(now = new Date()) {
  const due = await db.dataSubjectRequest.findMany({ where: { completedAt: null, dueAt: { lte: new Date(now.getTime() + 5 * 86_400_000) } } });
  if (!due.length) return 0;
  const admins = await db.user.findMany({ where: { status: "ACTIVE", role: { key: { in: ["super_admin", "admin"] } } }, select: { id: true } });
  await notify({ userIds: admins.map((a) => a.id), type: "dsr.due", title: `${due.length} data request${due.length === 1 ? "" : "s"} due within 5 days`, link: "/settings/privacy", email: true });
  return due.length;
}
