import "server-only";
import type { DocumentCategory, Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/server/audit/audit";
import { requireScope, scopeOf, type Ctx } from "@/server/authz/context";
import { NotFoundError, RuleError } from "@/server/authz/errors";
import { newToken, sha256 } from "@/server/crypto/tokens";
import { db } from "@/server/db";
import { appUrl, sendEmail } from "@/server/email/send";
import { fileFromForm, signedFileUrl, storeFile } from "@/server/files/upload";
import { notify } from "@/server/notify/notify";

const id = z.string().cuid();
export const CATEGORIES = ["CARRIER_AGREEMENT", "CLIENT_CONTRACT", "NDA", "OFFER_LETTER", "STAFF_CONTRACT", "CAC", "COMPLIANCE", "TENDER", "POLICY", "OTHER"] as const;
const SIGN_LINK_DAYS = 14;

/**
 * Documents the caller may see: the documents module scope, then the per-document
 * restriction list (e.g. staff contracts only for HR and admins). Super Admin sees all.
 */
export function documentWhere(ctx: Ctx, action: "VIEW" | "CREATE" | "EDIT" | "DELETE"): Prisma.DocumentWhereInput {
  const scope = requireScope(ctx, "documents", action);
  const scoped: Prisma.DocumentWhereInput =
    scope === "ALL" ? {} : scope === "UNIT" ? { OR: [{ unitId: { in: ctx.unitIds } }, { uploadedById: ctx.userId }] } : { OR: [{ uploadedById: ctx.userId }, { staffUserId: ctx.userId }] };
  const restricted: Prisma.DocumentWhereInput = ctx.roleKey === "super_admin" ? {} : { OR: [{ restrictedTo: { isEmpty: true } }, { restrictedTo: { has: ctx.roleKey } }, { staffUserId: ctx.userId }] };
  return { AND: [scoped, restricted] };
}

export async function listDocuments(ctx: Ctx, raw: unknown) {
  const f = z.object({ q: z.string().trim().max(80).optional(), category: z.enum(CATEGORIES).optional(), expiring: z.boolean().optional(), unitId: id.nullable().optional() }).parse(raw ?? {});
  const soon = new Date(Date.now() + 60 * 86_400_000);
  const rows = await db.document.findMany({
    where: {
      AND: [
        documentWhere(ctx, "VIEW"),
        { status: { not: "ARCHIVED" } },
        f.category ? { category: f.category } : {},
        f.unitId ? { unitId: f.unitId } : {},
        f.expiring ? { expiresOn: { lte: soon } } : {},
        f.q ? { OR: [{ title: { contains: f.q, mode: "insensitive" } }, { carrier: { name: { contains: f.q, mode: "insensitive" } } }, { company: { name: { contains: f.q, mode: "insensitive" } } }, { contact: { displayName: { contains: f.q, mode: "insensitive" } } }] } : {},
      ],
    },
    include: { carrier: { select: { id: true, name: true } }, company: { select: { name: true } }, contact: { select: { id: true, displayName: true } }, staffUser: { select: { id: true, name: true } }, tender: { select: { id: true, title: true } }, unit: { select: { code: true } }, signatures: { select: { status: true, role: true } } },
    orderBy: [{ expiresOn: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 300,
  });
  const now = Date.now();
  return rows.map((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    status: d.status,
    unit: d.unit?.code ?? null,
    linkedTo: d.carrier ? { label: d.carrier.name, href: `/money/telecom/carriers/${d.carrier.id}` } : d.contact ? { label: d.contact.displayName, href: `/customers/contacts/${d.contact.id}` } : d.company ? { label: d.company.name, href: null } : d.staffUser ? { label: d.staffUser.name, href: `/team/staff/${d.staffUser.id}` } : d.tender ? { label: d.tender.title, href: `/customers/tenders?t=${d.tender.id}` } : null,
    effectiveOn: d.effectiveOn?.toISOString().slice(0, 10) ?? null,
    expiresOn: d.expiresOn?.toISOString().slice(0, 10) ?? null,
    daysLeft: d.expiresOn ? Math.ceil((d.expiresOn.getTime() - now) / 86_400_000) : null,
    hasFile: !!d.fileId || !!d.renderedBody,
    signatures: { signed: d.signatures.filter((s) => s.status === "signed").length, total: d.signatures.length },
    restricted: d.restrictedTo.length > 0,
  }));
}

const UploadInput = z.object({
  title: z.string().trim().min(2).max(160),
  category: z.enum(CATEGORIES),
  unitId: id.nullable().default(null),
  carrierId: id.nullable().default(null),
  contactId: id.nullable().default(null),
  tenderId: id.nullable().default(null),
  effectiveOn: z.coerce.date().nullable().default(null),
  expiresOn: z.coerce.date().nullable().default(null),
  renewalAlertDays: z.coerce.number().int().min(1).max(365).default(30),
  restrictedTo: z.array(z.enum(["super_admin", "admin", "hr", "finance", "ops_manager"])).max(5).default([]),
});

export async function uploadDocument(ctx: Ctx, form: FormData): Promise<{ id: string }> {
  const scope = requireScope(ctx, "documents", "CREATE");
  const g = (k: string) => (form.get(k) ? String(form.get(k)) : null);
  const input = UploadInput.parse({ title: g("title"), category: g("category"), unitId: g("unitId"), carrierId: g("carrierId"), contactId: g("contactId"), tenderId: g("tenderId"), effectiveOn: g("effectiveOn"), expiresOn: g("expiresOn"), renewalAlertDays: g("renewalAlertDays") ?? undefined, restrictedTo: form.getAll("restrictedTo").map(String) });
  if (scope !== "ALL" && input.unitId && !ctx.unitIds.includes(input.unitId)) throw new RuleError("Pick one of your units");
  if (input.expiresOn && input.effectiveOn && input.expiresOn < input.effectiveOn) throw new RuleError("It expires before it takes effect");
  const file = await fileFromForm(form, "file");
  if (!file) throw new RuleError("Attach the document (PDF or image)");
  const stored = await storeFile({ ...file, purpose: "document", userId: ctx.userId });
  return db.$transaction(async (tx) => {
    const d = await tx.document.create({ data: { ...input, category: input.category as DocumentCategory, fileId: stored.id, contentHash: stored.sha256, status: "SIGNED", uploadedById: ctx.userId } });
    await audit(tx, { actorId: ctx.userId, action: "document.upload", entityType: "Document", entityId: d.id, unitId: input.unitId, after: { title: d.title, category: d.category, sha256: stored.sha256 } });
    return { id: d.id };
  });
}

/** Short-lived signed link to the file, logged in the document's access log. */
export async function documentLink(ctx: Ctx, documentId: string, meta: { ip: string | null }) {
  const d = await db.document.findFirst({ where: { AND: [{ id: documentId }, documentWhere(ctx, "VIEW")] } });
  if (!d) throw new NotFoundError("Document");
  if (!d.fileId) throw new RuleError("This document is generated — open it to read or download");
  await db.documentAccessLog.create({ data: { documentId: d.id, userId: ctx.userId, action: "download", ip: meta.ip } });
  return { url: signedFileUrl(d.fileId, ctx.userId, 120) };
}

export async function documentDetail(ctx: Ctx, documentId: string) {
  const d = await db.document.findFirst({ where: { AND: [{ id: documentId }, documentWhere(ctx, "VIEW")] }, include: { signatures: { orderBy: { order: "asc" } }, accessLog: { orderBy: { at: "desc" }, take: 20, include: { user: { select: { name: true } } } }, uploadedBy: { select: { name: true } } } });
  if (!d) throw new NotFoundError("Document");
  return {
    id: d.id,
    title: d.title,
    category: d.category,
    status: d.status,
    sha256: d.contentHash,
    uploadedBy: d.uploadedBy?.name ?? null,
    createdAt: d.createdAt.toISOString(),
    expiresOn: d.expiresOn?.toISOString().slice(0, 10) ?? null,
    signatures: d.signatures.map((s) => ({ id: s.id, role: s.role, name: s.signerName, email: s.signerEmail, status: s.status, signedAt: s.signedAt?.toISOString() ?? null })),
    access: d.accessLog.map((a) => ({ who: a.user?.name ?? "External signer", action: a.action, at: a.at.toISOString() })),
  };
}

export async function archiveDocument(ctx: Ctx, documentId: string) {
  const d = await db.document.findFirst({ where: { AND: [{ id: documentId }, documentWhere(ctx, "DELETE")] } });
  if (!d) throw new NotFoundError("Document");
  if (d.packId) throw new RuleError("Staff contract documents are kept for the record");
  await db.$transaction(async (tx) => {
    await tx.document.update({ where: { id: d.id }, data: { status: "ARCHIVED" } });
    await audit(tx, { actorId: ctx.userId, action: "document.archive", entityType: "Document", entityId: d.id });
  });
}

// ── external signature (carrier / client) ─────────────────────────────────────

/** Email a single-use, expiring signing link to a counterparty. Only the token's hash is stored. */
export async function requestCounterpartySignature(ctx: Ctx, raw: unknown) {
  const input = z.object({ documentId: id, name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email().max(254) }).parse(raw);
  const d = await db.document.findFirst({ where: { AND: [{ id: input.documentId }, documentWhere(ctx, "EDIT")] } });
  if (!d) throw new NotFoundError("Document");
  if (!d.fileId) throw new RuleError("Upload the document file first");
  const token = newToken();
  await db.$transaction(async (tx) => {
    await tx.signature.create({ data: { documentId: d.id, role: "COUNTERPARTY", order: 1, signerName: input.name, signerEmail: input.email, tokenHash: sha256(token), tokenExpiresAt: new Date(Date.now() + SIGN_LINK_DAYS * 86_400_000) } });
    await tx.document.update({ where: { id: d.id }, data: { status: "AWAITING_SIGNATURE" } });
    await audit(tx, { actorId: ctx.userId, action: "document.signature_request", entityType: "Document", entityId: d.id, after: { to: input.email } });
  });
  await sendEmail({ to: input.email, subject: `Figuraid: please sign "${d.title}"`, text: `Hello ${input.name},\n\nFiguraid Ltd has asked you to review and sign "${d.title}". The link is personal to you and expires in ${SIGN_LINK_DAYS} days.`, template: "document_sign", cta: { label: "Review and sign", url: appUrl(`/sign/${token}`) } });
}

async function signatureByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const s = await db.signature.findUnique({ where: { tokenHash: sha256(token) }, include: { document: true } });
  if (!s || s.status !== "pending" || !s.tokenExpiresAt || s.tokenExpiresAt < new Date() || s.document.status === "ARCHIVED") return null;
  return s;
}

export async function peekSignature(token: string) {
  const s = await signatureByToken(token);
  if (!s) return null;
  await db.documentAccessLog.create({ data: { documentId: s.documentId, action: "view" } });
  return { title: s.document.title, signerName: s.signerName, fileUrl: s.document.fileId ? `/api/public/sign-file/${token}` : null, sha256: s.document.contentHash };
}

/** The file behind a live signing link (no session: the token is the credential). */
export async function fileForSignatureToken(token: string) {
  const s = await signatureByToken(token);
  return s?.document.fileId ?? null;
}

export async function signByToken(raw: unknown, meta: { ip: string | null; userAgent: string | null }) {
  const input = z.object({ token: z.string().max(100), typedName: z.string().trim().min(3).max(120), agree: z.literal(true) }).parse(raw);
  const s = await signatureByToken(input.token);
  if (!s) throw new RuleError("This signing link has expired or was already used");
  const n = (x: string) => x.toLowerCase().replace(/[^a-z]/g, "");
  if (n(input.typedName) !== n(s.signerName)) throw new RuleError(`Type your name as "${s.signerName}"`);
  await db.$transaction(async (tx) => {
    await tx.signature.update({ where: { id: s.id }, data: { status: "signed", signedAt: new Date(), typedName: input.typedName, contentHash: s.document.contentHash, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null, tokenHash: null } });
    const pending = await tx.signature.count({ where: { documentId: s.documentId, status: "pending" } });
    await tx.document.update({ where: { id: s.documentId }, data: { status: pending ? "PARTIALLY_SIGNED" : "SIGNED" } });
    await audit(tx, { actorId: null, actorType: "external", action: "document.sign_external", entityType: "Document", entityId: s.documentId, after: { signer: s.signerEmail } });
  });
  if (s.document.uploadedById) await notify({ userIds: [s.document.uploadedById], type: "document.signed", title: `${s.signerName} signed "${s.document.title}"`, link: "/team/documents" });
}

/** Daily job: renewal alerts at the document's alert window, then 7 and 1 days. */
export async function documentExpiryAlerts(now = new Date()): Promise<number> {
  const docs = await db.document.findMany({ where: { status: { notIn: ["ARCHIVED", "EXPIRED"] }, expiresOn: { not: null, lte: new Date(now.getTime() + 366 * 86_400_000) } }, select: { id: true, title: true, expiresOn: true, renewalAlertDays: true, uploadedById: true } });
  const admins = await db.user.findMany({ where: { status: "ACTIVE", role: { key: { in: ["super_admin", "admin"] } } }, select: { id: true } });
  let n = 0;
  for (const d of docs) {
    const days = Math.ceil((d.expiresOn!.getTime() - now.getTime()) / 86_400_000);
    if (days < 0) {
      await db.document.update({ where: { id: d.id }, data: { status: "EXPIRED" } });
      continue;
    }
    if (![d.renewalAlertDays, 7, 1].includes(days)) continue;
    await notify({ userIds: [...admins.map((a) => a.id), ...(d.uploadedById ? [d.uploadedById] : [])], type: "document.expiry", title: `"${d.title}" expires in ${days} day${days === 1 ? "" : "s"}`, link: "/team/documents?expiring=1", email: days <= 7 });
    n++;
  }
  return n;
}

export const canUpload = (ctx: Ctx) => !!scopeOf(ctx, "documents", "CREATE");
