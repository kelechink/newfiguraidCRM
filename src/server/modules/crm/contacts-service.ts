import "server-only";
import type { LeadChannel, LifecycleStage, Prisma } from "@prisma/client";
import { z } from "zod";
import { displayName, duplicateReason, leadScore, normalizeEmail, normalizePhone } from "@/domain/crm/contacts";
import { audit } from "@/server/audit/audit";
import { can, requireScope, type Ctx } from "@/server/authz/context";
import { ForbiddenError, NotFoundError, RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { contactWhere, dealWhere } from "./scope";

const id = z.string().cuid();
const CHANNELS = ["WHATSAPP", "INSTAGRAM", "FACEBOOK", "EMAIL", "WEBCHAT", "LINKEDIN", "PHONE", "SMS", "FORM", "REFERRAL", "META_AD", "WALK_IN", "TENDER", "IMPORT", "OTHER"] as const;
const LIFECYCLES = ["LEAD", "QUALIFIED", "CUSTOMER", "CHURNED", "ARCHIVED"] as const;

// ── list ─────────────────────────────────────────────────────────────────────

const ListInput = z.object({
  q: z.string().trim().max(100).optional(),
  lifecycle: z.enum(LIFECYCLES).optional(),
  source: z.enum(CHANNELS).optional(),
  ownerId: z.union([id, z.literal("me"), z.literal("none")]).optional(),
  unitId: id.nullable().optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

export async function listContacts(ctx: Ctx, raw: unknown) {
  const f = ListInput.parse(raw ?? {});
  const where: Prisma.ContactWhereInput = {
    AND: [
      contactWhere(ctx, "VIEW"),
      f.unitId ? { unitId: f.unitId } : {},
      f.lifecycle ? { lifecycle: f.lifecycle } : { lifecycle: { not: "ARCHIVED" } },
      f.source ? { sourceChannel: f.source } : {},
      f.ownerId === "me" ? { ownerId: ctx.userId } : f.ownerId === "none" ? { ownerId: null } : f.ownerId ? { ownerId: f.ownerId } : {},
      f.q
        ? {
            OR: [
              { displayName: { contains: f.q, mode: "insensitive" } },
              { email: { contains: f.q, mode: "insensitive" } },
              { phoneE164: { contains: f.q.replace(/\D/g, "") || "~" } },
              { company: { name: { contains: f.q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
  const [total, rows] = await Promise.all([
    db.contact.count({ where }),
    db.contact.findMany({
      where,
      orderBy: [{ lastActivityAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 50,
      skip: (f.page - 1) * 50,
      include: {
        owner: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
        unit: { select: { code: true } },
        _count: { select: { deals: { where: { status: "OPEN", deletedAt: null } } } },
      },
    }),
  ]);
  return {
    total,
    page: f.page,
    rows: rows.map((c) => ({
      id: c.id,
      name: c.displayName,
      email: c.email,
      phone: c.phoneE164 ?? c.phone,
      company: c.company,
      owner: c.owner,
      unit: c.unit.code,
      lifecycle: c.lifecycle,
      score: c.score,
      source: c.sourceChannel,
      openDeals: c._count.deals,
      lastActivityAt: c.lastActivityAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

// ── create / update ──────────────────────────────────────────────────────────

const ContactInput = z.object({
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  displayName: z.string().trim().max(160).optional(),
  email: z.string().trim().max(254).optional(),
  phone: z.string().trim().max(40).optional(),
  unitId: id,
  companyName: z.string().trim().max(160).optional(),
  ownerId: id.nullable().optional(),
  sourceChannel: z.enum(CHANNELS).optional(),
  sourceDetail: z.string().trim().max(200).optional(),
  lifecycle: z.enum(LIFECYCLES).optional(),
  budget: z.coerce.number().min(0).max(1e13).nullable().optional(),
});

async function findOrCreateCompany(unitId: string, name: string | undefined, ownerId: string | null) {
  if (!name) return null;
  const existing = await db.company.findFirst({ where: { unitId, name: { equals: name, mode: "insensitive" }, deletedAt: null } });
  return existing ?? (await db.company.create({ data: { unitId, name, ownerId } }));
}

export async function createContact(ctx: Ctx, raw: unknown): Promise<{ id: string }> {
  const scope = requireScope(ctx, "crm.contacts", "CREATE");
  const input = ContactInput.parse(raw);
  if (scope !== "ALL" && !ctx.unitIds.includes(input.unitId)) throw new ForbiddenError("crm.contacts:CREATE unit");
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  if (input.email && !email) throw new RuleError("That email address doesn't look right");
  if (input.phone && !phone) throw new RuleError("That phone number doesn't look right");
  const name = displayName(input.firstName, input.lastName, input.displayName ?? input.email ?? input.phone);
  if (name === "Unnamed contact" && !email && !phone) throw new RuleError("Add a name, email or phone");
  if (email || phone) {
    const dup = await db.contact.findFirst({
      where: { unitId: input.unitId, deletedAt: null, mergedIntoId: null, OR: [...(email ? [{ emailNormalized: email }] : []), ...(phone ? [{ phoneE164: phone }] : [])] },
      select: { id: true },
    });
    if (dup) throw new RuleError("A contact with that email or phone already exists in this unit. Search for them instead.");
  }
  const ownerId = scope === "OWN" ? ctx.userId : (input.ownerId ?? ctx.userId);
  const company = await findOrCreateCompany(input.unitId, input.companyName, ownerId);
  const c = await db.$transaction(async (tx) => {
    const row = await tx.contact.create({
      data: {
        unitId: input.unitId,
        ownerId,
        companyId: company?.id ?? null,
        firstName: input.firstName || null,
        lastName: input.lastName || null,
        displayName: name,
        email: input.email || null,
        emailNormalized: email,
        phone: input.phone || null,
        phoneE164: phone,
        whatsappId: phone?.slice(1) ?? null,
        sourceChannel: input.sourceChannel ?? "OTHER",
        sourceDetail: input.sourceDetail || null,
        lifecycle: input.lifecycle ?? "LEAD",
        budget: input.budget ?? null,
        lastActivityAt: new Date(),
      },
    });
    await tx.activity.create({ data: { type: "NOTE", contactId: row.id, actorId: ctx.userId, summary: `Contact created by ${ctx.name}` } });
    await audit(tx, { actorId: ctx.userId, action: "contact.create", entityType: "Contact", entityId: row.id, unitId: row.unitId });
    return row;
  });
  await recomputeScore(c.id);
  return { id: c.id };
}

export async function updateContact(ctx: Ctx, raw: unknown) {
  const input = ContactInput.partial().extend({ id }).parse(raw);
  const existing = await db.contact.findFirst({ where: { AND: [{ id: input.id }, contactWhere(ctx, "EDIT")] } });
  if (!existing) throw new NotFoundError("Contact");
  const email = input.email !== undefined ? normalizeEmail(input.email) : existing.emailNormalized;
  const phone = input.phone !== undefined ? normalizePhone(input.phone) : existing.phoneE164;
  if (input.email && !email) throw new RuleError("That email address doesn't look right");
  if (input.phone && !phone) throw new RuleError("That phone number doesn't look right");
  const scope = requireScope(ctx, "crm.contacts", "EDIT");
  if (input.unitId && input.unitId !== existing.unitId && scope !== "ALL" && !ctx.unitIds.includes(input.unitId)) throw new ForbiddenError("crm.contacts unit");
  if (input.ownerId !== undefined && scope === "OWN" && input.ownerId !== ctx.userId) throw new ForbiddenError("crm.contacts reassign");
  const company = input.companyName !== undefined ? await findOrCreateCompany(input.unitId ?? existing.unitId, input.companyName, existing.ownerId) : undefined;
  await db.$transaction(async (tx) => {
    await tx.contact.update({
      where: { id: existing.id },
      data: {
        firstName: input.firstName ?? undefined,
        lastName: input.lastName ?? undefined,
        displayName: input.firstName !== undefined || input.lastName !== undefined || input.displayName ? displayName(input.firstName ?? existing.firstName, input.lastName ?? existing.lastName, input.displayName ?? existing.displayName) : undefined,
        email: input.email !== undefined ? input.email || null : undefined,
        emailNormalized: email,
        phone: input.phone !== undefined ? input.phone || null : undefined,
        phoneE164: phone,
        unitId: input.unitId,
        ownerId: input.ownerId === undefined ? undefined : input.ownerId,
        companyId: company === undefined ? undefined : (company?.id ?? null),
        lifecycle: input.lifecycle,
        sourceChannel: input.sourceChannel,
        sourceDetail: input.sourceDetail,
        budget: input.budget === undefined ? undefined : input.budget,
      },
    });
    await audit(tx, { actorId: ctx.userId, action: "contact.update", entityType: "Contact", entityId: existing.id, before: { ownerId: existing.ownerId, lifecycle: existing.lifecycle }, after: { ownerId: input.ownerId ?? existing.ownerId, lifecycle: input.lifecycle ?? existing.lifecycle } });
  });
  await recomputeScore(existing.id);
}

// ── activity & scoring ───────────────────────────────────────────────────────

const ActivityInput = z.object({
  contactId: id,
  dealId: id.optional(),
  type: z.enum(["NOTE", "CALL", "MEETING", "EMAIL_SENT", "SMS"]),
  summary: z.string().trim().min(2).max(4000),
});

export async function logActivity(ctx: Ctx, raw: unknown) {
  const input = ActivityInput.parse(raw);
  const contact = await db.contact.findFirst({ where: { AND: [{ id: input.contactId }, contactWhere(ctx, "VIEW")] } });
  if (!contact) throw new NotFoundError("Contact");
  if (input.dealId && !(await db.deal.count({ where: { AND: [{ id: input.dealId, contactId: contact.id }, dealWhere(ctx, "VIEW")] } }))) throw new NotFoundError("Deal");
  await db.activity.create({ data: { type: input.type, contactId: contact.id, dealId: input.dealId, actorId: ctx.userId, summary: input.summary } });
  await db.contact.update({ where: { id: contact.id }, data: { lastActivityAt: new Date() } });
  await recomputeScore(contact.id);
}

export async function recomputeScore(contactId: string) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const c = await db.contact.findUnique({
    where: { id: contactId },
    include: { _count: { select: { activities: { where: { occurredAt: { gte: since } } }, deals: { where: { status: "OPEN", deletedAt: null } } } } },
  });
  if (!c) return;
  const inbound = await db.message.count({ where: { direction: "INBOUND", sentAt: { gte: since }, conversation: { contactId } } });
  const days = c.lastActivityAt ? Math.floor((Date.now() - c.lastActivityAt.getTime()) / 86_400_000) : null;
  const score = leadScore({ source: c.sourceChannel, budgetNgn: c.budget ? Number(c.budget) : null, activities30d: c._count.activities, inboundMessages30d: inbound, daysSinceLastActivity: days, hasOpenDeal: c._count.deals > 0 });
  if (score !== c.score) await db.contact.update({ where: { id: c.id }, data: { score } });
}

// ── detail & timeline ────────────────────────────────────────────────────────

export async function getContact(ctx: Ctx, contactId: string) {
  const c = await db.contact.findFirst({
    where: { AND: [{ id: contactId }, contactWhere(ctx, "VIEW")] },
    include: {
      owner: { select: { id: true, name: true } },
      company: { select: { id: true, name: true } },
      unit: { select: { id: true, code: true, name: true } },
      tags: { include: { tag: true } },
      consents: { orderBy: { createdAt: "desc" } },
      deals: { where: { deletedAt: null }, include: { stage: { select: { name: true } }, pipeline: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      conversations: { include: { channel: { select: { type: true, name: true } }, messages: { orderBy: { sentAt: "desc" }, take: 1 } }, orderBy: { updatedAt: "desc" }, take: 10 },
      tickets: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, number: true, subject: true, status: true, createdAt: true } },
      activities: { orderBy: { occurredAt: "desc" }, take: 100, include: { actor: { select: { name: true } } } },
    },
  });
  if (!c) throw new NotFoundError("Contact");
  const showMoney = can(ctx, "finance.invoices", "VIEW");
  const invoices = showMoney
    ? await db.invoice.findMany({ where: { contactId: c.id }, orderBy: { issueDate: "desc" }, take: 10, select: { id: true, number: true, total: true, currency: true, status: true, issueDate: true } })
    : [];
  const consent = (ch: "EMAIL" | "WHATSAPP" | "SMS") => c.consents.find((x) => x.channel === ch)?.granted ?? null;
  const candidates = await db.contact.findMany({
    where: {
      AND: [
        contactWhere(ctx, "VIEW"),
        { id: { not: c.id } },
        { OR: [...(c.emailNormalized ? [{ emailNormalized: c.emailNormalized }] : []), ...(c.phoneE164 ? [{ phoneE164: c.phoneE164 }] : []), { displayName: { equals: c.displayName, mode: "insensitive" as const } }] },
      ],
    },
    take: 5,
    select: { id: true, displayName: true, emailNormalized: true, phoneE164: true, unit: { select: { code: true } } },
  });
  return {
    id: c.id,
    name: c.displayName,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phoneE164 ?? c.phone,
    company: c.company,
    owner: c.owner,
    unit: c.unit,
    lifecycle: c.lifecycle,
    score: c.score,
    budget: c.budget ? Number(c.budget) : null,
    source: { channel: c.sourceChannel, detail: c.sourceDetail, utmSource: c.utmSource, utmMedium: c.utmMedium, utmCampaign: c.utmCampaign, referralCode: c.referralCode },
    tags: c.tags.map((t) => t.tag.name),
    consent: { email: consent("EMAIL"), whatsapp: consent("WHATSAPP"), sms: consent("SMS") },
    createdAt: c.createdAt.toISOString(),
    deals: c.deals.map((d) => ({ id: d.id, title: d.title, value: Number(d.value), currency: d.currency, status: d.status, stage: d.stage.name, pipeline: d.pipeline.name })),
    conversations: c.conversations.map((v) => ({ id: v.id, channel: v.channel.type, channelName: v.channel.name, status: v.status, last: v.messages[0]?.body.slice(0, 140) ?? "", at: (v.messages[0]?.sentAt ?? v.updatedAt).toISOString() })),
    tickets: c.tickets.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })),
    invoices: invoices.map((i) => ({ id: i.id, number: i.number, total: Number(i.total), currency: i.currency, status: i.status, issueDate: i.issueDate.toISOString() })),
    timeline: c.activities.map((a) => ({ id: a.id, type: a.type, summary: a.summary, actor: a.actor?.name ?? null, at: a.occurredAt.toISOString() })),
    duplicates: candidates
      .map((d) => ({ id: d.id, name: d.displayName, unit: d.unit.code, reason: duplicateReason({ id: c.id, displayName: c.displayName, emailNormalized: c.emailNormalized, phoneE164: c.phoneE164 }, { id: d.id, displayName: d.displayName, emailNormalized: d.emailNormalized, phoneE164: d.phoneE164 }) }))
      .filter((d) => d.reason),
    canEdit: !!(await db.contact.count({ where: { AND: [{ id: c.id }, contactWhere(ctx, "EDIT")] } }).catch(() => 0)),
  };
}

// ── merge duplicates ─────────────────────────────────────────────────────────

/** Fold `duplicateId` into `survivorId`: every related record moves; blanks are filled; the duplicate is retired. */
export async function mergeContacts(ctx: Ctx, raw: unknown) {
  const { survivorId, duplicateId } = z.object({ survivorId: id, duplicateId: id }).parse(raw);
  if (survivorId === duplicateId) throw new RuleError("Pick two different contacts");
  const [s, d] = await Promise.all([
    db.contact.findFirst({ where: { AND: [{ id: survivorId }, contactWhere(ctx, "EDIT")] } }),
    db.contact.findFirst({ where: { AND: [{ id: duplicateId }, contactWhere(ctx, "EDIT")] } }),
  ]);
  if (!s || !d) throw new NotFoundError("Contact");
  await db.$transaction(async (tx) => {
    const move = { where: { contactId: d.id }, data: { contactId: s.id } };
    await tx.deal.updateMany(move);
    await tx.activity.updateMany(move);
    await tx.conversation.updateMany(move);
    await tx.formSubmission.updateMany(move);
    await tx.emailMessage.updateMany(move);
    await tx.consent.updateMany(move);
    await tx.invoice.updateMany(move);
    await tx.payment.updateMany(move);
    await tx.ticket.updateMany(move);
    await tx.resaleItem.updateMany(move);
    await tx.domain.updateMany(move);
    await tx.document.updateMany(move);
    await tx.referral.updateMany(move);
    await tx.dataSubjectRequest.updateMany(move);
    // unique pairs: keep the survivor's row when both exist
    const survivorSeqs = new Set((await tx.sequenceEnrollment.findMany({ where: { contactId: s.id }, select: { sequenceId: true } })).map((e) => e.sequenceId));
    await tx.sequenceEnrollment.deleteMany({ where: { contactId: d.id, sequenceId: { in: [...survivorSeqs] } } });
    await tx.sequenceEnrollment.updateMany(move);
    const survivorCohorts = new Set((await tx.courseEnrollment.findMany({ where: { contactId: s.id }, select: { cohortId: true } })).map((e) => e.cohortId));
    await tx.courseEnrollment.updateMany({ where: { contactId: d.id, cohortId: { notIn: [...survivorCohorts] } }, data: { contactId: s.id } });
    const tags = await tx.contactTag.findMany({ where: { contactId: d.id } });
    await tx.contactTag.createMany({ data: tags.map((t) => ({ contactId: s.id, tagId: t.tagId })), skipDuplicates: true });
    await tx.contactTag.deleteMany({ where: { contactId: d.id } });
    if (!(await tx.referrer.findUnique({ where: { contactId: s.id } }))) await tx.referrer.updateMany(move);
    await tx.contact.update({
      where: { id: s.id },
      data: {
        email: s.email ?? d.email,
        emailNormalized: s.emailNormalized ?? d.emailNormalized,
        phone: s.phone ?? d.phone,
        phoneE164: s.phoneE164 ?? d.phoneE164,
        whatsappId: s.whatsappId ?? d.whatsappId,
        instagramId: s.instagramId ?? d.instagramId,
        facebookPsid: s.facebookPsid ?? d.facebookPsid,
        companyId: s.companyId ?? d.companyId,
        budget: s.budget ?? d.budget,
        campaignId: s.campaignId ?? d.campaignId,
        utmSource: s.utmSource ?? d.utmSource,
        utmCampaign: s.utmCampaign ?? d.utmCampaign,
      },
    });
    await tx.contact.update({ where: { id: d.id }, data: { mergedIntoId: s.id, deletedAt: new Date() } });
    await tx.activity.create({ data: { type: "MERGED", contactId: s.id, actorId: ctx.userId, summary: `${ctx.name} merged “${d.displayName}” into this contact` } });
    await audit(tx, { actorId: ctx.userId, action: "contact.merge", entityType: "Contact", entityId: s.id, before: { duplicateId: d.id, duplicateName: d.displayName } });
  });
  await recomputeScore(s.id);
}

export async function listDuplicateGroups(ctx: Ctx) {
  const rows = await db.contact.findMany({
    where: contactWhere(ctx, "VIEW"),
    select: { id: true, displayName: true, emailNormalized: true, phoneE164: true, unitId: true, createdAt: true },
    take: 5000,
  });
  const byKey = new Map<string, typeof rows>();
  for (const r of rows) {
    for (const key of [r.emailNormalized && `e:${r.emailNormalized}`, r.phoneE164 && `p:${r.phoneE164}`].filter(Boolean) as string[]) {
      byKey.set(key, [...(byKey.get(key) ?? []), r]);
    }
  }
  const seen = new Set<string>();
  return [...byKey.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([key, v]) => ({ key: key.slice(2), kind: key.startsWith("e") ? "email" : "phone", contacts: v.map((c) => ({ id: c.id, name: c.displayName, createdAt: c.createdAt.toISOString() })) }))
    .filter((g) => {
      const sig = g.contacts.map((c) => c.id).sort().join(",");
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    })
    .slice(0, 50);
}

export async function listCompanies(ctx: Ctx, q?: string) {
  const scope = requireScope(ctx, "crm.contacts", "VIEW");
  const rows = await db.company.findMany({
    where: { deletedAt: null, ...(scope === "ALL" ? {} : scope === "UNIT" ? { unitId: { in: ctx.unitIds } } : { ownerId: ctx.userId }), ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
    include: { _count: { select: { contacts: true, deals: true } } },
    orderBy: { name: "asc" },
    take: 100,
  });
  return rows.map((c) => ({ id: c.id, name: c.name, contacts: c._count.contacts, deals: c._count.deals }));
}

export function lifecycleLabel(l: LifecycleStage) {
  return l.charAt(0) + l.slice(1).toLowerCase();
}

export function channelLabel(c: LeadChannel | null) {
  return c ? c.replace("_", " ").toLowerCase().replace(/^\w/, (x) => x.toUpperCase()) : "—";
}
