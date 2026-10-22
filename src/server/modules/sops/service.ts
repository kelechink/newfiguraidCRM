import "server-only";
import { Prisma } from "@prisma/client";
import { rankBetween } from "@/domain/shared/rank";
import {
  addDays,
  CATCH_UP_DAYS,
  describeSchedule,
  latestDueOccurrence,
  localDate,
  nextOccurrence,
  occurrenceKey,
  zonedDateTime,
  type SopSchedule,
} from "@/domain/sop/schedule";
import type { PermScope } from "@/server/authz/catalog";
import { requireScope, scopeOf, type Ctx } from "@/server/authz/context";
import { NotFoundError, RuleError } from "@/server/authz/errors";
import { audit } from "@/server/audit/audit";
import { db } from "@/server/db";
import { topOfColumnRank } from "@/server/modules/tasks/service";
import { GenerateInput, SopInput } from "./schemas";

/** OWN for SOPs = SOPs the caller is assigned to. */
export function sopScopeWhere(ctx: Ctx, scope: PermScope): Prisma.SopWhereInput {
  switch (scope) {
    case "ALL":
      return {};
    case "UNIT":
      return { unitId: { in: ctx.unitIds } };
    case "OWN":
      return { assignees: { some: { userId: ctx.userId } } };
  }
}

function toSchedule(s: { frequency: SopSchedule["frequency"]; weekdays: number[]; dayOfMonth: number | null; startsOn: Date }): SopSchedule {
  return { frequency: s.frequency, weekdays: s.weekdays, dayOfMonth: s.dayOfMonth, startsOn: s.startsOn.toISOString().slice(0, 10) };
}

async function holidaysAround(today: string): Promise<Set<string>> {
  const rows = await db.publicHoliday.findMany({
    where: { date: { gte: new Date(addDays(today, -CATCH_UP_DAYS)), lte: new Date(addDays(today, 366)) } },
    select: { date: true },
  });
  return new Set(rows.map((h) => h.date.toISOString().slice(0, 10)));
}

export interface SopCard {
  id: string;
  title: string;
  summary: string | null;
  unit: { id: string; code: string; name: string };
  frequency: SopSchedule["frequency"];
  weekdays: number[];
  dayOfMonth: number | null;
  dueTime: string;
  defaultPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  isActive: boolean;
  version: number;
  schedule: string;
  nextOn: string | null;
  lastGeneratedOn: string | null;
  steps: { title: string; detail: string | null }[];
  assignees: { id: string; name: string }[];
  dueNow: number; // tasks "Generate due tasks" would create for this SOP right now
  openTasks: number;
  canEdit: boolean;
}

export async function listSops(ctx: Ctx, opts: { unitId: string | null }): Promise<SopCard[]> {
  const scope = requireScope(ctx, "sops", "VIEW");
  const editScope = scopeOf(ctx, "sops", "EDIT");
  const sops = await db.sop.findMany({
    where: { AND: [sopScopeWhere(ctx, scope), opts.unitId ? { unitId: opts.unitId } : {}] },
    include: {
      unit: { select: { id: true, code: true, name: true } },
      steps: { orderBy: { position: "asc" } },
      assignees: { include: { user: { select: { id: true, name: true } } } },
      _count: { select: { tasks: { where: { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] } } } } },
    },
    orderBy: [{ isActive: "desc" }, { title: "asc" }],
  });

  const today = localDate(new Date());
  const holidays = await holidaysAround(today);
  const plan = await planOccurrences(sops.map((s) => s.id), today, holidays);

  return sops.map((s) => {
    const schedule = toSchedule(s);
    return {
      id: s.id,
      title: s.title,
      summary: s.summary,
      unit: s.unit,
      frequency: s.frequency,
      weekdays: s.weekdays,
      dayOfMonth: s.dayOfMonth,
      dueTime: s.dueTime,
      defaultPriority: s.defaultPriority,
      isActive: s.isActive,
      version: s.version,
      schedule: describeSchedule(schedule, s.dueTime),
      nextOn: s.isActive ? nextOccurrence(schedule, today, holidays) : null,
      lastGeneratedOn: s.lastGeneratedOn?.toISOString().slice(0, 10) ?? null,
      steps: s.steps.map((st) => ({ title: st.title, detail: st.detail })),
      assignees: s.assignees.map((a) => a.user),
      dueNow: plan.filter((p) => p.sopId === s.id).length,
      openTasks: s._count.tasks,
      canEdit: editScope !== null && (editScope === "ALL" || ctx.unitIds.includes(s.unitId)),
    };
  });
}

// ── create / edit ────────────────────────────────────────────────────────────

async function assertAssigneesAllowed(ctx: Ctx, scope: PermScope, unitId: string, assigneeIds: string[]) {
  if (assigneeIds.length === 0) return;
  const ok = await db.user.count({
    where: {
      id: { in: assigneeIds },
      status: "ACTIVE",
      ...(scope === "ALL" ? {} : { OR: [{ primaryUnitId: unitId }, { units: { some: { unitId } } }] }),
    },
  });
  if (ok !== new Set(assigneeIds).size) throw new RuleError("Every assignee must be an active member of this unit");
}

export async function saveSop(ctx: Ctx, rawInput: unknown): Promise<{ id: string }> {
  const input = SopInput.parse(rawInput);
  const scope = requireScope(ctx, "sops", input.id ? "EDIT" : "CREATE");
  if (scope === "OWN") throw new RuleError("Only team leads can manage SOP templates");
  if (scope === "UNIT" && !ctx.unitIds.includes(input.unitId)) throw new RuleError("You can only manage SOPs in your own unit");
  await assertAssigneesAllowed(ctx, scope, input.unitId, input.assigneeIds);

  const data = {
    title: input.title,
    summary: input.summary || null,
    unitId: input.unitId,
    frequency: input.frequency,
    weekdays: input.frequency === "WEEKLY" ? [...new Set(input.weekdays)].sort() : [],
    dayOfMonth: input.frequency === "MONTHLY" ? input.dayOfMonth : null,
    dueTime: input.dueTime,
    defaultPriority: input.defaultPriority,
    isActive: input.isActive,
  };
  const steps = input.steps.map((s, i) => ({ position: i + 1, title: s.title, detail: s.detail || null }));

  return db.$transaction(async (tx) => {
    if (!input.id) {
      const sop = await tx.sop.create({
        data: {
          ...data,
          ownerId: ctx.userId,
          startsOn: new Date(localDate(new Date())),
          steps: { create: steps },
          assignees: { create: input.assigneeIds.map((userId) => ({ userId })) },
        },
      });
      await audit(tx, { actorId: ctx.userId, action: "sop.create", entityType: "Sop", entityId: sop.id, unitId: sop.unitId, after: { ...data, steps } });
      return { id: sop.id };
    }

    const existing = await tx.sop.findFirst({
      where: { AND: [{ id: input.id }, sopScopeWhere(ctx, scope)] },
      include: { steps: { orderBy: { position: "asc" } } },
    });
    if (!existing) throw new NotFoundError("SOP");
    const stepsChanged =
      JSON.stringify(existing.steps.map((s) => [s.title, s.detail])) !== JSON.stringify(steps.map((s) => [s.title, s.detail]));

    await tx.sopStep.deleteMany({ where: { sopId: existing.id } });
    await tx.sopAssignee.deleteMany({ where: { sopId: existing.id } });
    await tx.sop.update({
      where: { id: existing.id },
      data: {
        ...data,
        version: stepsChanged ? existing.version + 1 : existing.version,
        steps: { create: steps },
        assignees: { create: input.assigneeIds.map((userId) => ({ userId })) },
      },
    });
    await audit(tx, {
      actorId: ctx.userId,
      action: "sop.update",
      entityType: "Sop",
      entityId: existing.id,
      unitId: data.unitId,
      before: { title: existing.title, frequency: existing.frequency, version: existing.version },
      after: { ...data, steps, version: stepsChanged ? existing.version + 1 : existing.version },
    });
    return { id: existing.id };
  });
}

// ── generate due tasks ───────────────────────────────────────────────────────

interface PlannedTask {
  sopId: string;
  date: string;
  assigneeId: string;
  key: string;
}

/** (latest due occurrence × assignee) pairs that don't have a task yet. */
async function planOccurrences(sopIds: string[], today: string, holidays: Set<string>): Promise<PlannedTask[]> {
  if (sopIds.length === 0) return [];
  const sops = await db.sop.findMany({
    where: { id: { in: sopIds }, isActive: true, frequency: { not: "ON_DEMAND" } },
    include: { assignees: { where: { user: { status: "ACTIVE" } }, select: { userId: true } } },
  });
  const wanted: PlannedTask[] = sops.flatMap((s) => {
    const date = latestDueOccurrence(toSchedule(s), today, holidays);
    return date ? s.assignees.map((a) => ({ sopId: s.id, date, assigneeId: a.userId, key: occurrenceKey(date, a.userId) })) : [];
  });
  if (wanted.length === 0) return [];
  const existing = await db.task.findMany({
    where: { sopId: { in: sopIds }, sopOccurrenceKey: { in: [...new Set(wanted.map((w) => w.key))] } },
    select: { sopId: true, sopOccurrenceKey: true },
  });
  const have = new Set(existing.map((e) => `${e.sopId}|${e.sopOccurrenceKey}`));
  return wanted.filter((w) => !have.has(`${w.sopId}|${w.key}`));
}

export interface GenerateResult {
  created: number;
  alreadyExisted: number;
  sops: number;
  dryRun: boolean;
}

/**
 * "Generate due tasks": one task per assignee for each SOP's latest due occurrence
 * (within the last 7 days) that doesn't exist yet. Idempotent — the (sopId, sopOccurrenceKey) unique index means pressing twice,
 * or two leads pressing at once, never duplicates work.
 */
export async function generateDueTasks(ctx: Ctx, rawInput: unknown): Promise<GenerateResult> {
  const input = GenerateInput.parse(rawInput ?? {});
  // Generating work is managing SOPs: same permission and scope as creating a template.
  const scope = requireScope(ctx, "sops", "CREATE");
  if (scope === "OWN") throw new RuleError("Only team leads can generate SOP tasks");

  const inScope = await db.sop.findMany({
    where: { AND: [sopScopeWhere(ctx, scope), input.sopId ? { id: input.sopId } : {}] },
    select: { id: true },
  });
  if (input.sopId && inScope.length === 0) throw new NotFoundError("SOP");

  const today = localDate(new Date());
  const holidays = await holidaysAround(today);
  const plan = await planOccurrences(inScope.map((s) => s.id), today, holidays);
  const sopCount = new Set(plan.map((p) => p.sopId)).size;
  if (input.dryRun || plan.length === 0) return { created: 0, alreadyExisted: 0, sops: sopCount, dryRun: input.dryRun };

  const sops = await db.sop.findMany({
    where: { id: { in: [...new Set(plan.map((p) => p.sopId))] } },
    include: { steps: { orderBy: { position: "asc" } } },
  });
  const byId = new Map(sops.map((s) => [s.id, s]));

  // Most overdue first, all above whatever is already at the top of "To do".
  plan.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const top = await topOfColumnRank(db, "TODO");
  let prev: string | null = null;
  const ranks = plan.map(() => (prev = rankBetween(prev, top)));

  let created = 0;
  let alreadyExisted = 0;
  const perAssignee = new Map<string, number>();
  for (const [i, p] of plan.entries()) {
    const sop = byId.get(p.sopId)!;
    try {
      await db.task.create({
        data: {
          title: sop.title,
          description: sop.summary,
          unitId: sop.unitId,
          assigneeId: p.assigneeId,
          createdById: ctx.userId,
          priority: sop.defaultPriority,
          dueAt: zonedDateTime(p.date, sop.dueTime),
          origin: "SOP",
          source: "SYSTEM",
          sopId: sop.id,
          sopOccurrenceKey: p.key,
          boardRank: ranks[i]!,
          checklist: { create: sop.steps.map((s) => ({ position: s.position, label: s.title, sopStepId: s.id })) },
        },
      });
      created++;
      perAssignee.set(p.assigneeId, (perAssignee.get(p.assigneeId) ?? 0) + 1);
    } catch (e) {
      // someone else generated this occurrence a moment ago
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") alreadyExisted++;
      else throw e;
    }
  }

  await db.$transaction(async (tx) => {
    await tx.sop.updateMany({ where: { id: { in: [...byId.keys()] } }, data: { lastGeneratedOn: new Date(today) } });
    await tx.notification.createMany({
      data: [...perAssignee]
        .filter(([userId]) => userId !== ctx.userId)
        .map(([userId, n]) => ({
          userId,
          type: "task.sop_generated",
          title: `${n} SOP task${n === 1 ? "" : "s"} added to your board`,
          link: "/work/tasks?origin=SOP",
        })),
    });
    await audit(tx, {
      actorId: ctx.userId,
      action: "sop.generate",
      entityType: "Sop",
      entityId: input.sopId,
      after: { created, alreadyExisted, sopIds: [...byId.keys()], date: today },
    });
  });

  return { created, alreadyExisted, sops: sopCount, dryRun: false };
}
