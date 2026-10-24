import "server-only";
import { z } from "zod";
import { audit } from "@/server/audit/audit";
import { requireScope, scopeWhere, type Ctx } from "@/server/authz/context";
import { NotFoundError, RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { fileFromForm, storeFile } from "@/server/files/upload";
import { notify } from "@/server/notify/notify";
import type { Prisma } from "@prisma/client";

const id = z.string().cuid();
export const TENDER_STAGES = ["IDENTIFIED", "CONTACT_MADE", "PROPOSAL_DRAFTED", "SUBMITTED", "PRESENTATION", "AWARDED", "LOST"] as const;
/** Usual Nigerian public-procurement requirements; editable per tender. */
const DEFAULT_CHECKLIST = ["CAC certificate of incorporation", "CAC status report (CAC 2 & 7)", "Tax clearance certificate (3 years)", "PENCOM compliance certificate", "ITF compliance certificate", "NSITF compliance certificate", "BPP IRR registration", "Audited accounts (3 years)", "Bank reference letter", "Sworn affidavit", "Technical proposal", "Financial proposal"];

const tenderWhere = (ctx: Ctx, a: "VIEW" | "CREATE" | "EDIT" | "DELETE") =>
  scopeWhere<Prisma.TenderWhereInput>(ctx, requireScope(ctx, "tenders", a), { unit: (ids) => ({ unitId: { in: ids } }), own: (me) => ({ ownerId: me }) });

export async function listTenders(ctx: Ctx) {
  const rows = await db.tender.findMany({ where: tenderWhere(ctx, "VIEW"), include: { owner: { select: { id: true, name: true } }, unit: { select: { code: true } }, checklist: { select: { required: true, doneAt: true } } }, orderBy: [{ deadline: "asc" }] });
  const now = Date.now();
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    agency: t.agency,
    state: t.state,
    reference: t.reference,
    deadline: t.deadline.toISOString(),
    daysLeft: Math.ceil((t.deadline.getTime() - now) / 86_400_000),
    value: t.estimatedValue != null ? Number(t.estimatedValue) : null,
    currency: t.currency,
    stage: t.stage,
    owner: t.owner,
    unit: t.unit.code,
    ready: t.checklist.filter((c) => c.required && c.doneAt).length,
    required: t.checklist.filter((c) => c.required).length,
  }));
}

export async function getTender(ctx: Ctx, tenderId: string) {
  const t = await db.tender.findFirst({ where: { AND: [{ id: tenderId }, tenderWhere(ctx, "VIEW")] }, include: { owner: { select: { id: true, name: true } }, checklist: { orderBy: { label: "asc" } }, documents: { select: { id: true, title: true, status: true } } } });
  if (!t) throw new NotFoundError("Tender");
  return { ...t, estimatedValue: t.estimatedValue != null ? Number(t.estimatedValue) : null, deadline: t.deadline.toISOString(), contacts: (t.contacts as { name: string; role?: string; phone?: string; email?: string }[] | null) ?? [], checklist: t.checklist.map((c) => ({ id: c.id, label: c.label, required: c.required, hasFile: !!c.fileId, doneAt: c.doneAt?.toISOString() ?? null })) };
}

const TenderInput = z.object({
  id: id.optional(),
  unitId: id,
  title: z.string().trim().min(3).max(200),
  agency: z.string().trim().min(2).max(160),
  state: z.string().trim().max(60).default("Akwa Ibom"),
  reference: z.string().trim().max(80).optional(),
  deadline: z.coerce.date(),
  estimatedValue: z.coerce.number().min(0).max(1e13).nullable().default(null),
  currency: z.enum(["NGN", "USD", "EUR", "GBP"]).default("NGN"),
  ownerId: id.optional(),
  contacts: z.array(z.object({ name: z.string().trim().min(1).max(100), role: z.string().trim().max(60).optional(), phone: z.string().trim().max(40).optional(), email: z.string().trim().max(254).optional() })).max(10).default([]),
});

export async function saveTender(ctx: Ctx, raw: unknown): Promise<{ id: string }> {
  const input = TenderInput.parse(raw);
  const s = requireScope(ctx, "tenders", input.id ? "EDIT" : "CREATE");
  if (s !== "ALL" && !ctx.unitIds.includes(input.unitId)) throw new RuleError("Pick one of your units");
  const { id: tenderId, ...data } = input;
  return db.$transaction(async (tx) => {
    if (tenderId) {
      const before = await tx.tender.findFirst({ where: { AND: [{ id: tenderId }, tenderWhere(ctx, "EDIT")] } });
      if (!before) throw new NotFoundError("Tender");
      await tx.tender.update({ where: { id: tenderId }, data: { ...data, reference: data.reference || null, ownerId: data.ownerId ?? before.ownerId } });
      return { id: tenderId };
    }
    const t = await tx.tender.create({ data: { ...data, reference: data.reference || null, ownerId: data.ownerId ?? ctx.userId, checklist: { create: DEFAULT_CHECKLIST.map((label) => ({ label })) } } });
    await audit(tx, { actorId: ctx.userId, action: "tender.create", entityType: "Tender", entityId: t.id, unitId: t.unitId, after: { title: t.title, agency: t.agency } });
    return { id: t.id };
  });
}

export async function moveTender(ctx: Ctx, raw: unknown) {
  const { tenderId, stage, outcomeNote } = z.object({ tenderId: id, stage: z.enum(TENDER_STAGES), outcomeNote: z.string().trim().max(1000).optional() }).parse(raw);
  const t = await db.tender.findFirst({ where: { AND: [{ id: tenderId }, tenderWhere(ctx, "EDIT")] }, include: { checklist: true } });
  if (!t) throw new NotFoundError("Tender");
  if (stage === "SUBMITTED") {
    const missing = t.checklist.filter((c) => c.required && !c.doneAt);
    if (missing.length) throw new RuleError(`Still missing: ${missing.slice(0, 4).map((m) => m.label).join(", ")}${missing.length > 4 ? "…" : ""}`);
  }
  if ((stage === "AWARDED" || stage === "LOST") && !outcomeNote) throw new RuleError("Record the outcome");
  await db.$transaction(async (tx) => {
    await tx.tender.update({ where: { id: t.id }, data: { stage, outcomeNote: outcomeNote ?? t.outcomeNote } });
    await audit(tx, { actorId: ctx.userId, action: "tender.stage", entityType: "Tender", entityId: t.id, unitId: t.unitId, before: { stage: t.stage }, after: { stage } });
  });
}

/** Tick a checklist item, optionally with the supporting file. */
export async function updateChecklistItem(ctx: Ctx, form: FormData) {
  const { itemId, done, label, required } = z.object({ itemId: id.optional(), tenderId: id, done: z.enum(["true", "false"]).optional(), label: z.string().trim().min(2).max(120).optional(), required: z.enum(["true", "false"]).optional() }).parse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  const tenderId = String(form.get("tenderId"));
  const t = await db.tender.findFirst({ where: { AND: [{ id: tenderId }, tenderWhere(ctx, "EDIT")] } });
  if (!t) throw new NotFoundError("Tender");
  const file = await fileFromForm(form, "file");
  const fileId = file ? (await storeFile({ ...file, purpose: "document", userId: ctx.userId })).id : undefined;
  if (!itemId) {
    if (!label) throw new RuleError("Name the requirement");
    await db.tenderChecklistItem.create({ data: { tenderId, label, required: required !== "false", fileId: fileId ?? null, doneAt: fileId ? new Date() : null } });
    return;
  }
  const item = await db.tenderChecklistItem.findFirst({ where: { id: itemId, tenderId } });
  if (!item) throw new NotFoundError("Checklist item");
  await db.tenderChecklistItem.update({ where: { id: item.id }, data: { ...(fileId ? { fileId } : {}), doneAt: done === "false" ? null : done === "true" || fileId ? new Date() : item.doneAt } });
}

/** Daily job: deadline alerts at 14, 7, 3 and 1 days to the owner. */
export async function tenderDeadlineAlerts(now = new Date()): Promise<number> {
  const open = await db.tender.findMany({ where: { stage: { in: ["IDENTIFIED", "CONTACT_MADE", "PROPOSAL_DRAFTED"] }, deadline: { gte: now, lte: new Date(now.getTime() + 15 * 86_400_000) } }, include: { checklist: true } });
  let n = 0;
  for (const t of open) {
    const days = Math.ceil((t.deadline.getTime() - now.getTime()) / 86_400_000);
    if (![14, 7, 3, 1].includes(days)) continue;
    const missing = t.checklist.filter((c) => c.required && !c.doneAt).length;
    await notify({ userIds: [t.ownerId], type: "tender.deadline", title: `${t.title}: ${days} day${days === 1 ? "" : "s"} to the deadline`, body: missing ? `${missing} required document${missing === 1 ? "" : "s"} still missing.` : "All required documents are in.", link: `/customers/tenders?t=${t.id}`, email: days <= 3 });
    n++;
  }
  return n;
}
