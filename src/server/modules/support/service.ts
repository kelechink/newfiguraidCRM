import "server-only";
import type { Prisma, Priority } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/server/audit/audit";
import { requireScope, scopeWhere, type Ctx } from "@/server/authz/context";
import { NotFoundError, RuleError } from "@/server/authz/errors";
import { newToken, sha256 } from "@/server/crypto/tokens";
import { db } from "@/server/db";
import { appUrl, sendEmail } from "@/server/email/send";
import { notify } from "@/server/notify/notify";

const id = z.string().cuid();
const H = 3_600_000;
/** First response / resolution targets by priority (hours). */
export const SLA: Record<Priority, { first: number; resolve: number }> = { URGENT: { first: 1, resolve: 8 }, HIGH: { first: 4, resolve: 24 }, MEDIUM: { first: 8, resolve: 72 }, LOW: { first: 24, resolve: 120 } };
const STATUSES = ["NEW", "OPEN", "PENDING_CUSTOMER", "ON_HOLD", "RESOLVED", "CLOSED"] as const;

const ticketWhere = (ctx: Ctx, a: "VIEW" | "CREATE" | "EDIT") =>
  scopeWhere<Prisma.TicketWhereInput>(ctx, requireScope(ctx, "support.tickets", a), { unit: (ids) => ({ unitId: { in: ids } }), own: (me) => ({ assigneeId: me }) });

export async function listTickets(ctx: Ctx, raw: unknown) {
  const f = z.object({ view: z.enum(["open", "mine", "breached", "resolved", "all"]).default("open"), unitId: id.nullable().optional(), q: z.string().trim().max(80).optional() }).parse(raw ?? {});
  const now = new Date();
  const rows = await db.ticket.findMany({
    where: {
      AND: [
        ticketWhere(ctx, "VIEW"),
        f.unitId ? { unitId: f.unitId } : {},
        f.view === "open" ? { status: { notIn: ["RESOLVED", "CLOSED"] } } : f.view === "mine" ? { assigneeId: ctx.userId, status: { notIn: ["RESOLVED", "CLOSED"] } } : f.view === "resolved" ? { status: { in: ["RESOLVED", "CLOSED"] } } : f.view === "breached" ? { status: { notIn: ["RESOLVED", "CLOSED"] }, OR: [{ firstResponseAt: null, firstResponseDueAt: { lt: now } }, { resolutionDueAt: { lt: now } }] } : {},
        f.q ? { OR: [{ number: { contains: f.q, mode: "insensitive" } }, { subject: { contains: f.q, mode: "insensitive" } }, { contact: { displayName: { contains: f.q, mode: "insensitive" } } }] } : {},
      ],
    },
    include: { contact: { select: { id: true, displayName: true } }, assignee: { select: { id: true, name: true } }, unit: { select: { code: true } } },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 300,
  });
  return rows.map((t) => ({
    id: t.id,
    number: t.number,
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    unit: t.unit.code,
    contact: t.contact,
    assignee: t.assignee,
    createdAt: t.createdAt.toISOString(),
    firstResponseDueAt: t.firstResponseDueAt?.toISOString() ?? null,
    resolutionDueAt: t.resolutionDueAt?.toISOString() ?? null,
    responded: !!t.firstResponseAt,
    breached: !["RESOLVED", "CLOSED"].includes(t.status) && ((!t.firstResponseAt && !!t.firstResponseDueAt && t.firstResponseDueAt < now) || (!!t.resolutionDueAt && t.resolutionDueAt < now)),
    csat: t.csatScore,
  }));
}

async function nextNumber(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ticket-no'))`;
  const last = await tx.ticket.findFirst({ orderBy: { createdAt: "desc" }, select: { number: true } });
  return `T-${String((last ? Number(last.number.replace(/\D/g, "")) : 1000) + 1)}`;
}

const CreateInput = z.object({ unitId: id, contactId: id, subject: z.string().trim().min(3).max(200), body: z.string().trim().min(3).max(10_000), category: z.string().trim().max(60).optional(), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"), assigneeId: id.nullable().default(null), source: z.enum(["inbox", "email", "web_form", "phone"]).default("phone"), conversationId: id.nullable().default(null) });

export async function createTicket(ctx: Ctx | null, raw: unknown): Promise<{ id: string; number: string }> {
  const input = CreateInput.parse(raw);
  if (ctx) {
    const s = requireScope(ctx, "support.tickets", "CREATE");
    if (s !== "ALL" && !ctx.unitIds.includes(input.unitId)) throw new RuleError("Pick one of your units");
  }
  const now = Date.now();
  const sla = SLA[input.priority];
  const t = await db.$transaction(async (tx) => {
    const number = await nextNumber(tx);
    const row = await tx.ticket.create({
      data: {
        number,
        createdAt: new Date(now),
        unitId: input.unitId,
        contactId: input.contactId,
        conversationId: input.conversationId,
        source: input.source,
        subject: input.subject,
        category: input.category || null,
        priority: input.priority,
        status: input.assigneeId ? "OPEN" : "NEW",
        assigneeId: input.assigneeId ?? (ctx && requireScope(ctx, "support.tickets", "CREATE") === "OWN" ? ctx.userId : null),
        firstResponseDueAt: new Date(now + sla.first * H),
        resolutionDueAt: new Date(now + sla.resolve * H),
        comments: { create: { body: input.body, authorId: ctx?.userId ?? null, isPublic: false } },
      },
    });
    await audit(tx, { actorId: ctx?.userId ?? null, actorType: ctx ? "user" : "system", action: "ticket.create", entityType: "Ticket", entityId: row.id, unitId: row.unitId, after: { number, priority: input.priority } });
    return row;
  });
  if (t.assigneeId && t.assigneeId !== ctx?.userId) await notify({ userIds: [t.assigneeId], type: "ticket.assigned", title: `${t.number}: ${t.subject}`, body: `${input.priority.toLowerCase()} priority`, link: `/customers/tickets/${t.id}` });
  return { id: t.id, number: t.number };
}

export async function getTicket(ctx: Ctx, ticketId: string) {
  const t = await db.ticket.findFirst({ where: { AND: [{ id: ticketId }, ticketWhere(ctx, "VIEW")] }, include: { contact: { select: { id: true, displayName: true, email: true, phoneE164: true } }, assignee: { select: { id: true, name: true } }, comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true } } } }, unit: { select: { id: true, name: true, code: true } } } });
  if (!t) throw new NotFoundError("Ticket");
  return {
    id: t.id,
    number: t.number,
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    source: t.source,
    unit: t.unit,
    contact: { id: t.contact.id, name: t.contact.displayName, email: t.contact.email, phone: t.contact.phoneE164 },
    assignee: t.assignee,
    createdAt: t.createdAt.toISOString(),
    firstResponseDueAt: t.firstResponseDueAt?.toISOString() ?? null,
    firstResponseAt: t.firstResponseAt?.toISOString() ?? null,
    resolutionDueAt: t.resolutionDueAt?.toISOString() ?? null,
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    csat: t.csatScore != null ? { score: t.csatScore, comment: t.csatComment } : null,
    comments: t.comments.map((c) => ({ id: c.id, body: c.body, isPublic: c.isPublic, author: c.author?.name ?? t.contact.displayName, fromCustomer: !c.authorId, at: c.createdAt.toISOString() })),
  };
}

/** Internal note, or a public reply that's emailed to the customer and stops the first-response clock. */
export async function addComment(ctx: Ctx, raw: unknown) {
  const { ticketId, body, isPublic } = z.object({ ticketId: id, body: z.string().trim().min(1).max(10_000), isPublic: z.boolean() }).parse(raw);
  const t = await db.ticket.findFirst({ where: { AND: [{ id: ticketId }, ticketWhere(ctx, "EDIT")] }, include: { contact: true } });
  if (!t) throw new NotFoundError("Ticket");
  if (t.status === "CLOSED") throw new RuleError("This ticket is closed — open a new one");
  if (isPublic && !t.contact.email) throw new RuleError("The customer has no email — reply from the inbox instead");
  await db.$transaction(async (tx) => {
    await tx.ticketComment.create({ data: { ticketId: t.id, authorId: ctx.userId, body, isPublic } });
    if (isPublic) await tx.ticket.update({ where: { id: t.id }, data: { firstResponseAt: t.firstResponseAt ?? new Date(), status: t.status === "NEW" ? "OPEN" : t.status, assigneeId: t.assigneeId ?? ctx.userId } });
  });
  if (isPublic) await sendEmail({ to: t.contact.email!, subject: `[${t.number}] ${t.subject}`, text: body, contactId: t.contactId, template: "ticket_reply" });
}

export async function updateTicket(ctx: Ctx, raw: unknown) {
  const input = z.object({ ticketId: id, status: z.enum(STATUSES).optional(), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(), assigneeId: id.nullable().optional(), category: z.string().trim().max(60).optional() }).parse(raw);
  const t = await db.ticket.findFirst({ where: { AND: [{ id: input.ticketId }, ticketWhere(ctx, "EDIT")] }, include: { contact: true } });
  if (!t) throw new NotFoundError("Ticket");
  const resolving = input.status === "RESOLVED" && t.status !== "RESOLVED";
  const token = resolving && t.contact.email ? newToken() : null;
  await db.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: t.id },
      data: {
        ...(input.status ? { status: input.status, resolvedAt: ["RESOLVED", "CLOSED"].includes(input.status) ? (t.resolvedAt ?? new Date()) : null } : {}),
        ...(input.priority && input.priority !== t.priority ? { priority: input.priority, resolutionDueAt: new Date(t.createdAt.getTime() + SLA[input.priority].resolve * H), ...(t.firstResponseAt ? {} : { firstResponseDueAt: new Date(t.createdAt.getTime() + SLA[input.priority].first * H) }) } : {}),
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
        ...(input.category !== undefined ? { category: input.category || null } : {}),
        ...(token ? { csatTokenHash: sha256(token) } : {}),
      },
    });
    await audit(tx, { actorId: ctx.userId, action: "ticket.update", entityType: "Ticket", entityId: t.id, before: { status: t.status, priority: t.priority, assignee: t.assigneeId }, after: { status: input.status ?? t.status, priority: input.priority ?? t.priority, assignee: input.assigneeId === undefined ? t.assigneeId : input.assigneeId } });
  });
  if (input.assigneeId && input.assigneeId !== t.assigneeId && input.assigneeId !== ctx.userId) await notify({ userIds: [input.assigneeId], type: "ticket.assigned", title: `${t.number}: ${t.subject}`, link: `/customers/tickets/${t.id}` });
  if (token) await sendEmail({ to: t.contact.email!, subject: `[${t.number}] How did we do?`, text: `Hi ${t.contact.firstName ?? t.contact.displayName},\n\nWe've marked your request "${t.subject}" as resolved. Please take ten seconds to rate the help you got.`, contactId: t.contactId, template: "csat", cta: { label: "Rate our help", url: appUrl(`/csat/${token}`) } });
}

/** Public CSAT page: the emailed token is single-use and the only credential. */
export async function peekCsat(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const t = await db.ticket.findUnique({ where: { csatTokenHash: sha256(token) }, select: { number: true, subject: true, csatScore: true } });
  return t ? { number: t.number, subject: t.subject, done: t.csatScore != null } : null;
}

export async function submitCsat(raw: unknown) {
  const { token, score, comment } = z.object({ token: z.string().max(100), score: z.coerce.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() }).parse(raw);
  const t = await db.ticket.findUnique({ where: { csatTokenHash: sha256(token) } });
  if (!t || t.csatScore != null) throw new RuleError("This rating link has already been used");
  await db.ticket.update({ where: { id: t.id }, data: { csatScore: score, csatComment: comment || null, csatTokenHash: null } });
  if (score <= 2 && t.assigneeId) {
    const leads = await db.user.findMany({ where: { status: "ACTIVE", role: { key: { in: ["ops_manager", "unit_manager"] } }, OR: [{ primaryUnitId: t.unitId }, { role: { key: "ops_manager" } }] }, select: { id: true } });
    await notify({ userIds: [t.assigneeId, ...leads.map((l) => l.id)], type: "ticket.low_csat", title: `${t.number} was rated ${score}/5`, body: comment || undefined, link: `/customers/tickets/${t.id}` });
  }
}

export async function supportStats(ctx: Ctx) {
  const where = ticketWhere(ctx, "VIEW");
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [open, breached, resolved, rated] = await Promise.all([
    db.ticket.count({ where: { AND: [where, { status: { notIn: ["RESOLVED", "CLOSED"] } }] } }),
    db.ticket.count({ where: { AND: [where, { status: { notIn: ["RESOLVED", "CLOSED"] } }, { OR: [{ firstResponseAt: null, firstResponseDueAt: { lt: new Date() } }, { resolutionDueAt: { lt: new Date() } }] }] } }),
    db.ticket.findMany({ where: { AND: [where, { resolvedAt: { gte: since } }] }, select: { createdAt: true, resolvedAt: true, firstResponseAt: true, firstResponseDueAt: true } }),
    db.ticket.aggregate({ where: { AND: [where, { csatScore: { not: null } }, { resolvedAt: { gte: since } }] }, _avg: { csatScore: true }, _count: { csatScore: true } }),
  ]);
  const onTime = resolved.filter((t) => t.firstResponseAt && t.firstResponseDueAt && t.firstResponseAt <= t.firstResponseDueAt).length;
  const hours = resolved.map((t) => (t.resolvedAt!.getTime() - t.createdAt.getTime()) / H).sort((a, b) => a - b);
  return { open, breached, resolved30: resolved.length, firstResponseOnTimePct: resolved.length ? Math.round((onTime / resolved.length) * 100) : null, medianResolutionHours: hours.length ? Math.round(hours[Math.floor(hours.length / 2)]! * 10) / 10 : null, csatAvg: rated._avg.csatScore != null ? Math.round(rated._avg.csatScore * 10) / 10 : null, csatCount: rated._count.csatScore };
}

/** Every 5 minutes: tell the assignee (or the unit's managers) when an SLA is about to breach. */
export async function slaWarnings(now = new Date()): Promise<number> {
  const soon = new Date(now.getTime() + 15 * 60_000);
  const rows = await db.ticket.findMany({ where: { status: { notIn: ["RESOLVED", "CLOSED"] }, OR: [{ firstResponseAt: null, firstResponseDueAt: { gte: now, lte: soon } }, { resolutionDueAt: { gte: now, lte: soon } }] }, select: { id: true, number: true, subject: true, assigneeId: true, unitId: true } });
  let sent = 0;
  for (const t of rows) {
    if (await db.notification.count({ where: { type: "ticket.sla", link: `/customers/tickets/${t.id}`, createdAt: { gte: new Date(now.getTime() - 30 * 60_000) } } })) continue;
    sent++;
    const to = t.assigneeId ? [t.assigneeId] : (await db.user.findMany({ where: { status: "ACTIVE", role: { key: "unit_manager" }, primaryUnitId: t.unitId }, select: { id: true } })).map((u) => u.id);
    await notify({ userIds: to, type: "ticket.sla", title: `${t.number} breaches its SLA in under 15 minutes`, body: t.subject, link: `/customers/tickets/${t.id}` });
  }
  return sent;
}
