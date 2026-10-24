import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { normalizeEmail, normalizePhone } from "@/domain/crm/contacts";
import { rankBetween } from "@/domain/shared/rank";
import { audit } from "@/server/audit/audit";
import { requireScope, scopeOf, type Ctx } from "@/server/authz/context";
import { ForbiddenError, NotFoundError, RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { notify } from "@/server/notify/notify";
import { createContact, recomputeScore } from "./contacts-service";
import { contactWhere, dealWhere } from "./scope";

const id = z.string().cuid();

/** Pipelines whose unit the caller can see deals in. */
export async function listPipelines(ctx: Ctx) {
  const scope = requireScope(ctx, "crm.deals", "VIEW");
  const rows = await db.pipeline.findMany({
    where: { kind: "sales", ...(scope === "ALL" ? {} : { unitId: { in: ctx.unitIds } }) },
    include: { unit: { select: { id: true, code: true, name: true } } },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
  return rows.map((p) => ({ id: p.id, name: p.name, unit: p.unit }));
}

export interface BoardDeal {
  id: string;
  title: string;
  value: number;
  currency: string;
  probability: number;
  expectedCloseDate: string | null;
  owner: { id: string; name: string } | null;
  contact: { id: string; name: string } | null;
  company: string | null;
  stageId: string;
  rank: string;
  status: string;
  score: number | null;
  source: string | null;
  updatedAt: string;
}

export async function getBoard(ctx: Ctx, pipelineId: string) {
  const pipeline = await db.pipeline.findUnique({ where: { id: pipelineId }, include: { stages: { orderBy: { position: "asc" } }, unit: { select: { id: true, code: true, name: true } } } });
  const scope = requireScope(ctx, "crm.deals", "VIEW");
  if (!pipeline || (scope !== "ALL" && !ctx.unitIds.includes(pipeline.unitId))) throw new NotFoundError("Pipeline");
  const closedSince = new Date(Date.now() - 30 * 86_400_000);
  const deals = await db.deal.findMany({
    where: { AND: [dealWhere(ctx, "VIEW"), { pipelineId }, { OR: [{ status: "OPEN" }, { updatedAt: { gte: closedSince } }] }] },
    include: { owner: { select: { id: true, name: true } }, contact: { select: { id: true, displayName: true, score: true } }, company: { select: { name: true } } },
    take: 2000,
  });
  const lostReasons = await db.lostReason.findMany({ where: { active: true }, orderBy: { label: "asc" } });
  const editScope = scopeOf(ctx, "crm.deals", "EDIT");
  return {
    pipeline: { id: pipeline.id, name: pipeline.name, unit: pipeline.unit },
    stages: pipeline.stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, probability: s.probability, color: s.color })),
    deals: deals
      .map(
        (d): BoardDeal => ({
          id: d.id,
          title: d.title,
          value: Number(d.value),
          currency: d.currency,
          probability: d.probability ?? pipeline.stages.find((s) => s.id === d.stageId)?.probability ?? 0,
          expectedCloseDate: d.expectedCloseDate?.toISOString() ?? null,
          owner: d.owner,
          contact: d.contact ? { id: d.contact.id, name: d.contact.displayName } : null,
          company: d.company?.name ?? null,
          stageId: d.stageId,
          rank: d.rank,
          status: d.status,
          score: d.contact?.score ?? null,
          source: d.sourceChannel,
          updatedAt: d.updatedAt.toISOString(),
        }),
      )
      .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0)),
    lostReasons: lostReasons.map((r) => ({ id: r.id, label: r.label })),
    canEdit: !!editScope,
    canManageStages: editScope === "UNIT" || editScope === "ALL",
  };
}

async function topRank(stageId: string) {
  const rows = await db.$queryRaw<{ r: string }[]>`SELECT rank AS r FROM "Deal" WHERE "stageId" = ${stageId} ORDER BY rank COLLATE "C" ASC LIMIT 1`;
  return rankBetween(null, rows[0]?.r ?? null);
}

const DealInput = z.object({
  pipelineId: id,
  stageId: id.optional(),
  title: z.string().trim().min(2).max(200),
  contactId: id.optional(),
  newContact: z.object({ name: z.string().trim().min(2).max(160), email: z.string().max(254).optional(), phone: z.string().max(40).optional() }).optional(),
  value: z.coerce.number().min(0).max(1e13).default(0),
  currency: z.enum(["NGN", "USD", "GBP", "EUR"]).default("NGN"),
  probability: z.coerce.number().int().min(0).max(100).nullable().optional(),
  expectedCloseDate: z.coerce.date().nullable().optional(),
  ownerId: id.nullable().optional(),
  sourceChannel: z.enum(["WHATSAPP", "INSTAGRAM", "FACEBOOK", "EMAIL", "WEBCHAT", "LINKEDIN", "PHONE", "SMS", "FORM", "REFERRAL", "META_AD", "WALK_IN", "TENDER", "IMPORT", "OTHER"]).optional(),
});

export async function createDeal(ctx: Ctx, raw: unknown): Promise<{ id: string }> {
  const scope = requireScope(ctx, "crm.deals", "CREATE");
  const input = DealInput.parse(raw);
  const pipeline = await db.pipeline.findUnique({ where: { id: input.pipelineId }, include: { stages: { orderBy: { position: "asc" } } } });
  if (!pipeline) throw new NotFoundError("Pipeline");
  if (scope !== "ALL" && !ctx.unitIds.includes(pipeline.unitId)) throw new ForbiddenError("crm.deals unit");
  const stage = input.stageId ? pipeline.stages.find((s) => s.id === input.stageId) : pipeline.stages.find((s) => s.kind === "OPEN");
  if (!stage) throw new RuleError("Pick a stage");

  let contactId = input.contactId ?? null;
  if (contactId && !(await db.contact.count({ where: { AND: [{ id: contactId }, contactWhere(ctx, "VIEW")] } }))) throw new NotFoundError("Contact");
  if (!contactId && input.newContact) {
    const email = normalizeEmail(input.newContact.email);
    const phone = normalizePhone(input.newContact.phone);
    const existing = await db.contact.findFirst({
      where: { AND: [contactWhere(ctx, "VIEW"), { unitId: pipeline.unitId }, { OR: [...(email ? [{ emailNormalized: email }] : []), ...(phone ? [{ phoneE164: phone }] : [])] }] },
    });
    contactId =
      existing?.id ??
      (await createContact(ctx, { displayName: input.newContact.name, email: input.newContact.email, phone: input.newContact.phone, unitId: pipeline.unitId, sourceChannel: input.sourceChannel })).id;
  }
  const ownerId = scope === "OWN" ? ctx.userId : (input.ownerId ?? ctx.userId);
  const deal = await db.$transaction(async (tx) => {
    const d = await tx.deal.create({
      data: {
        unitId: pipeline.unitId,
        pipelineId: pipeline.id,
        stageId: stage.id,
        contactId,
        ownerId,
        title: input.title,
        value: input.value,
        currency: input.currency,
        probability: input.probability ?? null,
        expectedCloseDate: input.expectedCloseDate ?? null,
        sourceChannel: input.sourceChannel ?? null,
        rank: await topRank(stage.id),
        status: stage.kind === "OPEN" ? "OPEN" : stage.kind,
      },
    });
    await tx.activity.create({ data: { type: "DEAL_CREATED", contactId, dealId: d.id, actorId: ctx.userId, summary: `Deal “${d.title}” created in ${stage.name}` } });
    await audit(tx, { actorId: ctx.userId, action: "deal.create", entityType: "Deal", entityId: d.id, unitId: d.unitId, after: { value: input.value, currency: input.currency } });
    return d;
  });
  if (ownerId !== ctx.userId) await notify({ userIds: [ownerId], type: "deal.assigned", title: `${ctx.name} gave you a deal: ${deal.title}`, link: `/customers/pipelines?p=${pipeline.id}&deal=${deal.id}` });
  if (contactId) await recomputeScore(contactId);
  return { id: deal.id };
}

const MoveInput = z.object({
  dealId: id,
  stageId: id,
  beforeId: id.nullable().default(null),
  afterId: id.nullable().default(null),
  lostReasonId: id.optional(),
  lostNote: z.string().trim().max(1000).optional(),
});

export async function moveDeal(ctx: Ctx, raw: unknown): Promise<{ rank: string; status: string }> {
  const input = MoveInput.parse(raw);
  const deal = await db.deal.findFirst({ where: { AND: [{ id: input.dealId }, dealWhere(ctx, "EDIT")] }, include: { stage: true, referral: true } });
  if (!deal) throw new NotFoundError("Deal");
  const stage = await db.pipelineStage.findFirst({ where: { id: input.stageId, pipelineId: deal.pipelineId } });
  if (!stage) throw new NotFoundError("Stage");
  if (stage.kind === "LOST" && deal.stage.kind !== "LOST" && !input.lostReasonId) throw new RuleError("Choose why it was lost");

  const neighbours = await db.deal.findMany({ where: { id: { in: [input.beforeId, input.afterId].filter((x): x is string => !!x) }, stageId: stage.id }, select: { id: true, rank: true } });
  const before = neighbours.find((n) => n.id === input.beforeId)?.rank ?? null;
  const after = neighbours.find((n) => n.id === input.afterId)?.rank ?? null;
  let rank: string;
  if (before && after && before < after) rank = rankBetween(before, after);
  else if (before) rank = rankBetween(before, null);
  else if (after) rank = rankBetween(null, after);
  else rank = await topRank(stage.id);

  const status = stage.kind === "OPEN" ? "OPEN" : stage.kind;
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.deal.update({
      where: { id: deal.id },
      data: {
        stageId: stage.id,
        rank,
        status,
        wonAt: status === "WON" ? (deal.wonAt ?? now) : null,
        lostAt: status === "LOST" ? (deal.lostAt ?? now) : null,
        lostReasonId: status === "LOST" ? (input.lostReasonId ?? deal.lostReasonId) : null,
        lostNote: status === "LOST" ? (input.lostNote ?? deal.lostNote) : null,
      },
    });
    if (stage.id !== deal.stageId) {
      const type = status === "WON" ? "DEAL_WON" : status === "LOST" ? "DEAL_LOST" : "STAGE_CHANGED";
      await tx.activity.create({ data: { type, contactId: deal.contactId, dealId: deal.id, actorId: ctx.userId, summary: `${deal.title}: ${deal.stage.name} → ${stage.name}` } });
      await audit(tx, { actorId: ctx.userId, action: "deal.stage", entityType: "Deal", entityId: deal.id, unitId: deal.unitId, before: { stage: deal.stage.name }, after: { stage: stage.name, status } });
    }
    if (status === "WON" && deal.contactId) await tx.contact.update({ where: { id: deal.contactId }, data: { lifecycle: "CUSTOMER", lastActivityAt: now } });
    // Referral programme: a won deal earns the referrer their commission (Module Q).
    if (deal.referral && status === "WON" && deal.referral.status !== "paid") {
      const rule = await tx.commissionRule.findFirst({ where: { unitId: deal.unitId, isActive: true, validFrom: { lte: now } }, orderBy: { validFrom: "desc" } });
      const commission = rule ? (rule.type === "PERCENT" ? (Number(deal.value) * Number(rule.value)) / 100 : Number(rule.value)) : 0;
      await tx.referral.update({ where: { id: deal.referral.id }, data: { status: "won", commissionAmount: Math.round(commission * 100) / 100 } });
    }
    if (deal.referral && status === "LOST" && deal.referral.status !== "paid") await tx.referral.update({ where: { id: deal.referral.id }, data: { status: "lost", commissionAmount: null } });
  });
  if (deal.contactId) await recomputeScore(deal.contactId);
  return { rank, status };
}

const UpdateDealInput = z.object({
  dealId: id,
  title: z.string().trim().min(2).max(200).optional(),
  value: z.coerce.number().min(0).max(1e13).optional(),
  currency: z.enum(["NGN", "USD", "GBP", "EUR"]).optional(),
  probability: z.coerce.number().int().min(0).max(100).nullable().optional(),
  expectedCloseDate: z.coerce.date().nullable().optional(),
  ownerId: id.nullable().optional(),
});

export async function updateDeal(ctx: Ctx, raw: unknown) {
  const input = UpdateDealInput.parse(raw);
  const deal = await db.deal.findFirst({ where: { AND: [{ id: input.dealId }, dealWhere(ctx, "EDIT")] } });
  if (!deal) throw new NotFoundError("Deal");
  if (input.ownerId !== undefined && requireScope(ctx, "crm.deals", "EDIT") === "OWN" && input.ownerId !== ctx.userId) throw new ForbiddenError("crm.deals reassign");
  await db.$transaction(async (tx) => {
    await tx.deal.update({
      where: { id: deal.id },
      data: { title: input.title, value: input.value, currency: input.currency, probability: input.probability, expectedCloseDate: input.expectedCloseDate, ownerId: input.ownerId },
    });
    await audit(tx, { actorId: ctx.userId, action: "deal.update", entityType: "Deal", entityId: deal.id, unitId: deal.unitId, before: { value: Number(deal.value), ownerId: deal.ownerId }, after: { value: input.value ?? Number(deal.value), ownerId: input.ownerId ?? deal.ownerId } });
  });
  if (input.ownerId && input.ownerId !== deal.ownerId && input.ownerId !== ctx.userId) {
    await notify({ userIds: [input.ownerId], type: "deal.assigned", title: `${ctx.name} gave you a deal: ${input.title ?? deal.title}`, link: `/customers/pipelines?p=${deal.pipelineId}&deal=${deal.id}` });
  }
}

export async function getDeal(ctx: Ctx, dealId: string) {
  const d = await db.deal.findFirst({
    where: { AND: [{ id: dealId }, dealWhere(ctx, "VIEW")] },
    include: {
      owner: { select: { id: true, name: true } },
      contact: { select: { id: true, displayName: true, email: true, phoneE164: true } },
      stage: { select: { name: true } },
      lostReason: { select: { label: true } },
      activities: { orderBy: { occurredAt: "desc" }, take: 50, include: { actor: { select: { name: true } } } },
      referral: { include: { referrer: { select: { name: true, code: true } } } },
    },
  });
  if (!d) throw new NotFoundError("Deal");
  return {
    id: d.id,
    title: d.title,
    value: Number(d.value),
    currency: d.currency,
    probability: d.probability,
    expectedCloseDate: d.expectedCloseDate?.toISOString().slice(0, 10) ?? null,
    owner: d.owner,
    contact: d.contact ? { id: d.contact.id, name: d.contact.displayName, email: d.contact.email, phone: d.contact.phoneE164 } : null,
    stage: d.stage.name,
    status: d.status,
    lostReason: d.lostReason?.label ?? null,
    lostNote: d.lostNote,
    referral: d.referral ? { referrer: d.referral.referrer.name, code: d.referral.referrer.code, status: d.referral.status, commission: d.referral.commissionAmount ? Number(d.referral.commissionAmount) : null } : null,
    activities: d.activities.map((a) => ({ id: a.id, type: a.type, summary: a.summary, actor: a.actor?.name ?? null, at: a.occurredAt.toISOString() })),
  };
}

// ── pipeline set-up ──────────────────────────────────────────────────────────

const StagesInput = z.object({
  pipelineId: id,
  stages: z
    .array(z.object({ id: id.optional(), name: z.string().trim().min(1).max(40), probability: z.coerce.number().int().min(0).max(100), kind: z.enum(["OPEN", "WON", "LOST"]) }))
    .min(2)
    .max(12),
});

export async function saveStages(ctx: Ctx, raw: unknown) {
  const scope = requireScope(ctx, "crm.deals", "EDIT");
  if (scope === "OWN") throw new ForbiddenError("crm.deals pipeline setup");
  const input = StagesInput.parse(raw);
  const p = await db.pipeline.findUnique({ where: { id: input.pipelineId }, include: { stages: { include: { _count: { select: { deals: true } } } } } });
  if (!p || (scope !== "ALL" && !ctx.unitIds.includes(p.unitId))) throw new NotFoundError("Pipeline");
  if (!input.stages.some((s) => s.kind === "WON") || !input.stages.some((s) => s.kind === "LOST")) throw new RuleError("A pipeline needs a Won and a Lost stage");
  const keep = new Set(input.stages.map((s) => s.id).filter(Boolean));
  const removed = p.stages.filter((s) => !keep.has(s.id));
  if (removed.some((s) => s._count.deals > 0)) throw new RuleError("Move deals out of a stage before removing it");
  await db.$transaction(async (tx) => {
    await tx.pipelineStage.deleteMany({ where: { id: { in: removed.map((s) => s.id) } } });
    // shift positions out of the way to satisfy the (pipelineId, position) unique index
    await tx.pipelineStage.updateMany({ where: { pipelineId: p.id }, data: { position: { increment: 1000 } } });
    for (const [i, s] of input.stages.entries()) {
      if (s.id) await tx.pipelineStage.update({ where: { id: s.id }, data: { name: s.name, probability: s.probability, kind: s.kind, position: i + 1 } });
      else await tx.pipelineStage.create({ data: { pipelineId: p.id, name: s.name, probability: s.probability, kind: s.kind, position: i + 1 } });
    }
    await audit(tx, { actorId: ctx.userId, action: "pipeline.stages", entityType: "Pipeline", entityId: p.id, after: { stages: input.stages.map((s) => s.name) } });
  });
}

/** Weighted open pipeline by stage & unit — used by dashboards and the cash-flow forecast. */
export async function pipelineSummary(where: Prisma.DealWhereInput = {}) {
  const deals = await db.deal.findMany({
    where: { AND: [where, { status: "OPEN", deletedAt: null }] },
    select: { value: true, currency: true, probability: true, unitId: true, expectedCloseDate: true, stage: { select: { name: true, probability: true, position: true } } },
  });
  return deals.map((d) => ({
    unitId: d.unitId,
    stage: d.stage.name,
    position: d.stage.position,
    value: Number(d.value),
    currency: d.currency,
    probability: d.probability ?? d.stage.probability,
    expectedCloseDate: d.expectedCloseDate,
  }));
}
