import "server-only";
import type { Prisma, TargetMetric } from "@prisma/client";
import { z } from "zod";
import { rankBetween } from "@/domain/shared/rank";
import { addDays, isoWeekday, localDate, zonedDateTime } from "@/domain/sop/schedule";
import { originForCreator } from "@/domain/tasks/origin";
import { audit } from "@/server/audit/audit";
import type { PermScope } from "@/server/authz/catalog";
import { requireScope, scopeOf, type Ctx } from "@/server/authz/context";
import { NotFoundError, RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { notify } from "@/server/notify/notify";
import { topOfColumnRank } from "@/server/modules/tasks/service";

const id = z.string().cuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const METRIC_LABEL: Record<TargetMetric, string> = {
  LEADS_CONTACTED: "Leads contacted",
  DEALS_CLOSED: "Deals closed",
  REVENUE: "Revenue collected (₦)",
  MINUTES_SOLD: "Telecom minutes sold",
  TICKETS_RESOLVED: "Tickets resolved",
  CONVERSATIONS_HANDLED: "Conversations resolved",
  STUDENTS_ENROLLED: "Students enrolled",
  CUSTOM: "Custom",
};

/** Monday of the week containing `d` (business timezone). */
export function weekStartOf(d: string): string {
  return addDays(d, 1 - isoWeekday(d));
}

function peopleWhere(ctx: Ctx, scope: PermScope): Prisma.UserWhereInput {
  if (scope === "ALL") return {};
  if (scope === "UNIT") return { OR: [{ primaryUnitId: { in: ctx.unitIds } }, { units: { some: { unitId: { in: ctx.unitIds } } } }] };
  return { id: ctx.userId };
}

/** Achieved value for a metric, computed from the source records — never typed in (except CUSTOM). */
export async function measure(metric: TargetMetric, userId: string, weekStart: string): Promise<number> {
  const from = zonedDateTime(weekStart, "00:00");
  const to = zonedDateTime(addDays(weekStart, 7), "00:00");
  const range = { gte: from, lt: to };
  switch (metric) {
    case "LEADS_CONTACTED": {
      const [acts, convs] = await Promise.all([
        db.activity.findMany({ where: { actorId: userId, occurredAt: range, type: { in: ["CALL", "EMAIL_SENT", "MESSAGE", "MEETING", "SMS"] }, contactId: { not: null } }, select: { contactId: true }, distinct: ["contactId"] }),
        db.message.findMany({ where: { authorId: userId, direction: "OUTBOUND", sentAt: range }, select: { conversation: { select: { contactId: true } } } }),
      ]);
      return new Set([...acts.map((a) => a.contactId), ...convs.map((c) => c.conversation.contactId)]).size;
    }
    case "DEALS_CLOSED":
      return db.deal.count({ where: { ownerId: userId, status: "WON", wonAt: range } });
    case "REVENUE": {
      const r = await db.payment.aggregate({ _sum: { amountNgn: true }, where: { status: "CONFIRMED", receivedAt: range, invoice: { ownerId: userId } } });
      return Number(r._sum.amountNgn ?? 0);
    }
    case "MINUTES_SOLD": {
      const r = await db.trafficEntry.aggregate({ _sum: { customerBilledMinutes: true }, where: { periodStart: range, customerAccount: { carrier: { managerId: userId } } } });
      return Number(r._sum.customerBilledMinutes ?? 0);
    }
    case "TICKETS_RESOLVED":
      return db.ticket.count({ where: { assigneeId: userId, resolvedAt: range } });
    case "CONVERSATIONS_HANDLED":
      return db.conversation.count({ where: { resolvedById: userId, resolvedAt: range } });
    case "STUDENTS_ENROLLED":
      return db.courseEnrollment.count({ where: { state: { in: ["ENROLLED", "ACTIVE", "COMPLETED"] }, createdAt: range, contact: { ownerId: userId } } });
    case "CUSTOM":
      return -1;
  }
}

export interface TargetRow {
  id: string;
  userId: string;
  metric: TargetMetric;
  label: string;
  targetValue: number;
  achieved: number;
  pct: number;
  bonusAmount: number | null;
  setBy: string;
}

async function hydrate(rows: Awaited<ReturnType<typeof db.weeklyTarget.findMany<{ include: { setBy: { select: { name: true } } } }>>>): Promise<TargetRow[]> {
  return Promise.all(
    rows.map(async (t) => {
      const measured = await measure(t.metric, t.userId, t.weekStart.toISOString().slice(0, 10));
      const achieved = measured < 0 ? Number(t.achieved) : measured;
      if (measured >= 0 && Number(t.achieved) !== measured) await db.weeklyTarget.update({ where: { id: t.id }, data: { achieved: measured } });
      const target = Number(t.targetValue);
      return {
        id: t.id,
        userId: t.userId,
        metric: t.metric,
        label: t.metric === "CUSTOM" ? (t.label ?? "Custom") : METRIC_LABEL[t.metric],
        targetValue: target,
        achieved,
        pct: target > 0 ? Math.round((achieved / target) * 100) : 0,
        bonusAmount: t.bonusAmount ? Number(t.bonusAmount) : null,
        setBy: t.setBy.name,
      };
    }),
  );
}

export async function myWeek(ctx: Ctx, week?: string) {
  requireScope(ctx, "targets", "VIEW");
  const weekStart = weekStartOf(week ?? localDate(new Date()));
  const rows = await db.weeklyTarget.findMany({ where: { userId: ctx.userId, weekStart: new Date(weekStart) }, include: { setBy: { select: { name: true } } } });
  return { weekStart, targets: await hydrate(rows) };
}

const TargetInput = z.object({
  userId: id,
  weekStart: date,
  metric: z.enum(["LEADS_CONTACTED", "DEALS_CLOSED", "REVENUE", "MINUTES_SOLD", "TICKETS_RESOLVED", "CONVERSATIONS_HANDLED", "STUDENTS_ENROLLED", "CUSTOM"]),
  label: z.string().trim().max(80).optional(),
  targetValue: z.coerce.number().positive().max(1e12),
  bonusAmount: z.coerce.number().min(0).max(1e9).nullable().default(null),
});

export async function setTarget(ctx: Ctx, raw: unknown) {
  const scope = requireScope(ctx, "targets", "CREATE");
  const input = TargetInput.parse(raw);
  if (scope === "OWN") throw new RuleError("Managers set targets");
  if (input.metric === "CUSTOM" && !input.label) throw new RuleError("Name the custom target");
  const person = await db.user.findFirst({ where: { AND: [{ id: input.userId }, peopleWhere(ctx, scope), { status: "ACTIVE" }] }, select: { id: true, primaryUnitId: true } });
  if (!person) throw new NotFoundError("Person");
  if (person.id === ctx.userId && scope !== "ALL") throw new RuleError("Your own targets are set by your manager");
  const weekStart = weekStartOf(input.weekStart);
  const t = await db.$transaction(async (tx) => {
    const row = await tx.weeklyTarget.upsert({
      where: { userId_weekStart_metric_label: { userId: person.id, weekStart: new Date(weekStart), metric: input.metric, label: input.metric === "CUSTOM" ? input.label! : "" } },
      update: { targetValue: input.targetValue, bonusAmount: input.bonusAmount, setById: ctx.userId },
      create: {
        userId: person.id,
        unitId: person.primaryUnitId ?? ctx.primaryUnitId ?? "",
        weekStart: new Date(weekStart),
        metric: input.metric,
        label: input.metric === "CUSTOM" ? input.label! : "",
        targetValue: input.targetValue,
        bonusAmount: input.bonusAmount,
        setById: ctx.userId,
      },
    });
    await audit(tx, { actorId: ctx.userId, action: "target.set", entityType: "WeeklyTarget", entityId: row.id, after: { metric: input.metric, targetValue: input.targetValue, bonus: input.bonusAmount, weekStart } });
    return row;
  });
  await notify({ userIds: [person.id], type: "target.set", title: `New target for the week of ${weekStart}`, body: `${input.metric === "CUSTOM" ? input.label : METRIC_LABEL[input.metric]}: ${input.targetValue}`, link: "/work/targets" });
  return { id: t.id };
}

export async function updateCustomAchieved(ctx: Ctx, raw: unknown) {
  const { targetId, achieved } = z.object({ targetId: id, achieved: z.coerce.number().min(0).max(1e12) }).parse(raw);
  const t = await db.weeklyTarget.findUnique({ where: { id: targetId } });
  if (!t || t.metric !== "CUSTOM") throw new NotFoundError("Target");
  const scope = scopeOf(ctx, "targets", "EDIT");
  const mine = t.userId === ctx.userId;
  if (!mine && !(scope && (await db.user.count({ where: { AND: [{ id: t.userId }, peopleWhere(ctx, scope)] } })))) throw new NotFoundError("Target");
  await db.weeklyTarget.update({ where: { id: t.id }, data: { achieved } });
}

export async function deleteTarget(ctx: Ctx, targetId: string) {
  const scope = requireScope(ctx, "targets", "EDIT");
  const t = await db.weeklyTarget.findFirst({ where: { id: targetId, user: peopleWhere(ctx, scope) } });
  if (!t) throw new NotFoundError("Target");
  await db.$transaction(async (tx) => {
    await tx.task.updateMany({ where: { targetId: t.id }, data: { targetId: null } });
    await tx.weeklyTarget.delete({ where: { id: t.id } });
    await audit(tx, { actorId: ctx.userId, action: "target.delete", entityType: "WeeklyTarget", entityId: t.id });
  });
}

/**
 * Daily plan: one task per target for `day`, sized as the remaining gap ÷ remaining working days.
 * Origin follows whoever set the target (Founder or Team lead). Idempotent per target per day.
 */
export async function generateTargetTasks(ctx: Ctx, raw: unknown): Promise<{ created: number }> {
  const scope = requireScope(ctx, "targets", "CREATE");
  const day = z.object({ date: date.optional() }).parse(raw ?? {}).date ?? localDate(new Date());
  if (isoWeekday(day) > 5) return { created: 0 };
  const weekStart = weekStartOf(day);
  const targets = await db.weeklyTarget.findMany({
    where: { weekStart: new Date(weekStart), user: { AND: [peopleWhere(ctx, scope), { status: "ACTIVE" }] } },
    include: { setBy: { select: { role: { select: { key: true } } } }, user: { select: { primaryUnitId: true } } },
  });
  const dueAt = zonedDateTime(day, "17:00");
  const dayStart = zonedDateTime(day, "00:00");
  const daysLeft = 6 - isoWeekday(day); // Mon → 5 … Fri → 1
  let created = 0;
  let prev: string | null = null;
  const top = await topOfColumnRank(db, "TODO");
  for (const t of targets) {
    if (await db.task.count({ where: { targetId: t.id, dueAt: { gte: dayStart, lte: dueAt } } })) continue;
    const achieved = Math.max(0, await measure(t.metric, t.userId, weekStart));
    const remaining = Math.max(0, Number(t.targetValue) - (achieved < 0 ? Number(t.achieved) : achieved));
    if (remaining <= 0) continue;
    const today = Math.ceil(remaining / daysLeft);
    const label = t.metric === "CUSTOM" ? t.label : METRIC_LABEL[t.metric];
    const amount = t.metric === "REVENUE" ? `₦${today.toLocaleString("en-NG")}` : today.toLocaleString("en-NG");
    prev = rankBetween(prev, top);
    await db.task.create({
      data: {
        title: `${label}: ${amount} today`,
        description: `Weekly target ${Number(t.targetValue).toLocaleString("en-NG")}; ${remaining.toLocaleString("en-NG")} to go with ${daysLeft} working day${daysLeft === 1 ? "" : "s"} left.`,
        unitId: t.user.primaryUnitId ?? t.unitId,
        assigneeId: t.userId,
        createdById: t.setById,
        origin: originForCreator(t.setBy.role.key),
        source: "TARGET",
        targetId: t.id,
        priority: "MEDIUM",
        dueAt,
        boardRank: prev,
      },
    });
    created++;
  }
  return { created };
}

// ── scorecards ───────────────────────────────────────────────────────────────

export async function scorecards(ctx: Ctx, raw: unknown) {
  const scope = requireScope(ctx, "targets", "VIEW");
  const { week, unitId } = z.object({ week: date.optional(), unitId: id.nullable().optional() }).parse(raw ?? {});
  const weekStart = weekStartOf(week ?? localDate(new Date()));
  const from = zonedDateTime(weekStart, "00:00");
  const to = zonedDateTime(addDays(weekStart, 7), "00:00");
  const people = await db.user.findMany({
    where: { AND: [peopleWhere(ctx, scope), { status: "ACTIVE" }, unitId ? { OR: [{ primaryUnitId: unitId }, { units: { some: { unitId } } }] } : {}] },
    select: { id: true, name: true, primaryUnit: { select: { code: true } }, role: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  const targets = await db.weeklyTarget.findMany({ where: { weekStart: new Date(weekStart), userId: { in: people.map((p) => p.id) } }, include: { setBy: { select: { name: true } } } });
  const hydrated = await hydrate(targets);
  return Promise.all(
    people.map(async (p) => {
      const [due, doneOnTime, overdueOpen, reports, firstResponses] = await Promise.all([
        db.task.count({ where: { assigneeId: p.id, dueAt: { gte: from, lt: to }, status: { not: "CANCELLED" } } }),
        db.task.findMany({ where: { assigneeId: p.id, dueAt: { gte: from, lt: to }, status: "DONE" }, select: { dueAt: true, completedAt: true } }),
        db.task.count({ where: { assigneeId: p.id, dueAt: { lt: new Date() }, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } } }),
        db.dailyReport.count({ where: { userId: p.id, date: { gte: new Date(weekStart), lt: new Date(addDays(weekStart, 7)) } } }),
        db.conversationAssignment.findMany({ where: { userId: p.id, assignedAt: { gte: from, lt: to }, pickedUpAt: { not: null } }, select: { assignedAt: true, pickedUpAt: true } }),
      ]);
      const onTime = doneOnTime.filter((t) => t.completedAt && t.dueAt && t.completedAt <= t.dueAt).length;
      const mine = hydrated.filter((t) => t.userId === p.id);
      const avgPct = mine.length ? Math.round(mine.reduce((n, t) => n + Math.min(t.pct, 150), 0) / mine.length) : null;
      const avgResponse = firstResponses.length
        ? Math.round(firstResponses.reduce((n, a) => n + (a.pickedUpAt!.getTime() - a.assignedAt.getTime()) / 60_000, 0) / firstResponses.length)
        : null;
      return {
        user: { id: p.id, name: p.name, unit: p.primaryUnit?.code ?? null, role: p.role.name },
        targets: mine,
        targetPct: avgPct,
        tasksDue: due,
        onTimeRate: due ? Math.round((onTime / due) * 100) : null,
        overdueOpen,
        reports,
        avgResponseMin: avgResponse,
      };
    }),
  );
}

// ── end-of-day reports ───────────────────────────────────────────────────────

const ReportInput = z.object({
  date: date.optional(),
  accomplished: z.string().trim().min(10, "Say what you got done").max(4000),
  blockers: z.string().trim().max(2000).optional(),
  tomorrow: z.string().trim().max(2000).optional(),
});

export async function submitReport(ctx: Ctx, raw: unknown) {
  requireScope(ctx, "reports.daily", "CREATE");
  const input = ReportInput.parse(raw);
  const day = input.date ?? localDate(new Date());
  if (day > localDate(new Date()) || day < addDays(localDate(new Date()), -3)) throw new RuleError("Reports can be filed for today or the last 3 days");
  const focus = await db.focusSession.findFirst({ where: { userId: ctx.userId }, orderBy: { startedAt: "desc" } });
  await db.dailyReport.upsert({
    where: { userId_date: { userId: ctx.userId, date: new Date(day) } },
    update: { accomplished: input.accomplished, blockers: input.blockers || null, tomorrow: input.tomorrow || null, submittedAt: new Date() },
    create: { userId: ctx.userId, unitId: focus?.unitId ?? ctx.primaryUnitId ?? ctx.unitIds[0]!, date: new Date(day), accomplished: input.accomplished, blockers: input.blockers || null, tomorrow: input.tomorrow || null },
  });
  if (input.blockers) {
    const mgr = await db.user.findUnique({ where: { id: ctx.userId }, select: { managerId: true } });
    if (mgr?.managerId) await notify({ userIds: [mgr.managerId], type: "report.blocker", title: `${ctx.name} reported a blocker`, body: input.blockers.slice(0, 140), link: "/work/targets?tab=reports" });
  }
}

export async function listReports(ctx: Ctx, raw: unknown) {
  const scope = requireScope(ctx, "reports.daily", "VIEW");
  const { date: day, unitId } = z.object({ date: date.optional(), unitId: id.nullable().optional() }).parse(raw ?? {});
  const d = day ?? localDate(new Date());
  const people = await db.user.findMany({
    where: { AND: [peopleWhere(ctx, scope), { status: "ACTIVE" }, unitId ? { OR: [{ primaryUnitId: unitId }, { units: { some: { unitId } } }] } : {}] },
    select: { id: true, name: true, dailyReports: { where: { date: new Date(d) } } },
    orderBy: { name: "asc" },
  });
  return {
    date: d,
    rows: people.map((p) => {
      const r = p.dailyReports[0];
      return { user: { id: p.id, name: p.name }, report: r ? { accomplished: r.accomplished, blockers: r.blockers, tomorrow: r.tomorrow, submittedAt: r.submittedAt.toISOString() } : null };
    }),
  };
}

export async function myRecentReports(ctx: Ctx) {
  const rows = await db.dailyReport.findMany({ where: { userId: ctx.userId }, orderBy: { date: "desc" }, take: 7 });
  return rows.map((r) => ({ date: r.date.toISOString().slice(0, 10), accomplished: r.accomplished, blockers: r.blockers, tomorrow: r.tomorrow }));
}

// ── focus (which unit/project I'm working on) ────────────────────────────────

export async function setFocus(ctx: Ctx, raw: unknown) {
  const { unitId, projectId } = z.object({ unitId: id, projectId: id.nullable().default(null) }).parse(raw);
  if (!ctx.unitIds.includes(unitId)) throw new RuleError("Pick one of your units");
  await db.$transaction(async (tx) => {
    await tx.focusSession.updateMany({ where: { userId: ctx.userId, endedAt: null }, data: { endedAt: new Date() } });
    await tx.focusSession.create({ data: { userId: ctx.userId, unitId, projectId } });
  });
}

export async function currentFocus(ctx: Ctx) {
  const f = await db.focusSession.findFirst({ where: { userId: ctx.userId, endedAt: null }, orderBy: { startedAt: "desc" }, include: { project: { select: { name: true } } } });
  return f ? { unitId: f.unitId, project: f.project?.name ?? null, since: f.startedAt.toISOString() } : null;
}
