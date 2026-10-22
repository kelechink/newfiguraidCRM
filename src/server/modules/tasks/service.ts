import "server-only";
import type { Prisma, TaskStatus } from "@prisma/client";
import { rankBetween } from "@/domain/shared/rank";
import { originForCreator, type TaskOrigin } from "@/domain/tasks/origin";
import type { PermAction, PermScope } from "@/server/authz/catalog";
import { requireScope, type Ctx } from "@/server/authz/context";
import { NotFoundError, RuleError } from "@/server/authz/errors";
import { audit } from "@/server/audit/audit";
import { db } from "@/server/db";
import {
  BoardFilterInput,
  CreateTaskInput,
  MoveTaskInput,
  ToggleChecklistInput,
  type BoardStatus,
} from "./schemas";

/** Rows the caller may see/act on for a given scope. OWN = assigned to me or created by me. */
export function taskScopeWhere(ctx: Ctx, scope: PermScope): Prisma.TaskWhereInput {
  switch (scope) {
    case "ALL":
      return {};
    case "UNIT":
      return { unitId: { in: ctx.unitIds } };
    case "OWN":
      return { OR: [{ assigneeId: ctx.userId }, { createdById: ctx.userId }] };
  }
}

function scoped(ctx: Ctx, action: PermAction): Prisma.TaskWhereInput {
  return taskScopeWhere(ctx, requireScope(ctx, "tasks", action));
}

export interface BoardTask {
  id: string;
  title: string;
  description: string | null;
  status: BoardStatus;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  origin: TaskOrigin;
  dueAt: string | null;
  rank: string;
  unit: { id: string; code: string; name: string };
  assignee: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  sop: { id: string; title: string } | null;
  checklist: { done: number; total: number };
  completedAt: string | null;
}

/** Finished work stays on the board for a fortnight, then lives in reports. */
const DONE_VISIBLE_DAYS = 14;

export async function listBoard(ctx: Ctx, rawFilter: unknown): Promise<BoardTask[]> {
  const filter = BoardFilterInput.parse(rawFilter);
  const doneSince = new Date(Date.now() - DONE_VISIBLE_DAYS * 86_400_000);
  const rows = await db.task.findMany({
    where: {
      AND: [
        scoped(ctx, "VIEW"),
        { status: { not: "CANCELLED" } },
        { OR: [{ status: { not: "DONE" } }, { completedAt: { gte: doneSince } }] },
        filter.unitId ? { unitId: filter.unitId } : {},
        filter.origin ? { origin: filter.origin } : {},
        filter.mineOnly ? { assigneeId: ctx.userId } : {},
      ],
    },
    include: {
      unit: { select: { id: true, code: true, name: true } },
      assignee: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      sop: { select: { id: true, title: true } },
      checklist: { select: { doneAt: true } },
    },
    take: 1000,
  });

  return rows
    .map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status as BoardStatus,
      priority: t.priority,
      origin: t.origin,
      dueAt: t.dueAt?.toISOString() ?? null,
      rank: t.boardRank,
      unit: t.unit,
      assignee: t.assignee,
      createdBy: t.createdBy,
      sop: t.sop,
      checklist: { done: t.checklist.filter((c) => c.doneAt).length, total: t.checklist.length },
      completedAt: t.completedAt?.toISOString() ?? null,
    }))
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.id < b.id ? -1 : 1));
}

// ── ranks ────────────────────────────────────────────────────────────────────
// Ordering is global per status column; filtered boards show a subsequence.
// COLLATE "C" makes Postgres compare ranks byte-wise, like rankBetween does.

type Db = Prisma.TransactionClient | typeof db;

async function edgeRank(client: Db, status: TaskStatus, edge: "first" | "last"): Promise<string | null> {
  const rows =
    edge === "first"
      ? await client.$queryRaw<{ r: string }[]>`
          SELECT "boardRank" AS r FROM "Task" WHERE status = ${status}::"TaskStatus"
          ORDER BY "boardRank" COLLATE "C" ASC LIMIT 1`
      : await client.$queryRaw<{ r: string }[]>`
          SELECT "boardRank" AS r FROM "Task" WHERE status = ${status}::"TaskStatus"
          ORDER BY "boardRank" COLLATE "C" DESC LIMIT 1`;
  return rows[0]?.r ?? null;
}

async function neighbourRank(
  client: Db,
  status: TaskStatus,
  rank: string,
  dir: "after" | "before",
  excludeId: string,
): Promise<string | null> {
  const rows =
    dir === "after"
      ? await client.$queryRaw<{ r: string }[]>`
          SELECT "boardRank" AS r FROM "Task"
          WHERE status = ${status}::"TaskStatus" AND id <> ${excludeId} AND "boardRank" COLLATE "C" > ${rank}
          ORDER BY "boardRank" COLLATE "C" ASC LIMIT 1`
      : await client.$queryRaw<{ r: string }[]>`
          SELECT "boardRank" AS r FROM "Task"
          WHERE status = ${status}::"TaskStatus" AND id <> ${excludeId} AND "boardRank" COLLATE "C" < ${rank}
          ORDER BY "boardRank" COLLATE "C" DESC LIMIT 1`;
  return rows[0]?.r ?? null;
}

/** Rank for the top of a column. */
export async function topOfColumnRank(client: Db, status: TaskStatus): Promise<string> {
  return rankBetween(null, await edgeRank(client, status, "first"));
}

// ── mutations ────────────────────────────────────────────────────────────────

export async function createTask(ctx: Ctx, rawInput: unknown): Promise<{ id: string }> {
  const input = CreateTaskInput.parse(rawInput);
  const scope = requireScope(ctx, "tasks", "CREATE");
  // Assigning work is a lead's job: an OWN-scoped grant can't create tasks.
  if (scope === "OWN") throw new RuleError("Only team leads and the founder can assign tasks");
  if (scope === "UNIT" && !ctx.unitIds.includes(input.unitId)) {
    throw new RuleError("You can only create tasks in your own unit");
  }

  const assignee = await db.user.findFirst({
    where: {
      id: input.assigneeId,
      status: "ACTIVE",
      ...(scope === "UNIT"
        ? { OR: [{ primaryUnitId: input.unitId }, { units: { some: { unitId: input.unitId } } }] }
        : {}),
    },
    select: { id: true },
  });
  if (!assignee) throw new RuleError("Pick someone in that unit to assign this to");

  const origin = originForCreator(ctx.roleKey);
  return db.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        title: input.title,
        description: input.description || null,
        unitId: input.unitId,
        assigneeId: assignee.id,
        createdById: ctx.userId,
        priority: input.priority,
        dueAt: input.dueAt ?? null,
        origin,
        source: "MANUAL",
        boardRank: await topOfColumnRank(tx, "TODO"),
      },
    });
    if (assignee.id !== ctx.userId) {
      await tx.notification.create({
        data: {
          userId: assignee.id,
          type: "task.assigned",
          title: `${ctx.name} assigned you a task`,
          body: task.title,
          link: `/work/tasks?task=${task.id}`,
        },
      });
    }
    await audit(tx, {
      actorId: ctx.userId,
      action: "task.create",
      entityType: "Task",
      entityId: task.id,
      unitId: task.unitId,
      after: { title: task.title, assigneeId: task.assigneeId, origin },
    });
    return { id: task.id };
  });
}

export async function moveTask(ctx: Ctx, rawInput: unknown): Promise<{ rank: string }> {
  const input = MoveTaskInput.parse(rawInput);
  const task = await db.task.findFirst({
    where: { AND: [{ id: input.taskId }, scoped(ctx, "EDIT")] },
    select: { id: true, status: true, startedAt: true },
  });
  if (!task) throw new NotFoundError("Task");

  const status = input.status;
  const neighbourIds = [input.beforeId, input.afterId].filter((x): x is string => !!x && x !== task.id);
  const neighbours = await db.task.findMany({
    where: { id: { in: neighbourIds }, status },
    select: { id: true, boardRank: true },
  });
  const before = neighbours.find((n) => n.id === input.beforeId)?.boardRank ?? null;
  const after = neighbours.find((n) => n.id === input.afterId)?.boardRank ?? null;

  // Neighbours come from the client's (possibly filtered, possibly stale) view, so
  // fill gaps from the real column rather than trusting them.
  let rank: string;
  if (before !== null && after !== null && before < after) rank = rankBetween(before, after);
  else if (before !== null) rank = rankBetween(before, await neighbourRank(db, status, before, "after", task.id));
  else if (after !== null) rank = rankBetween(await neighbourRank(db, status, after, "before", task.id), after);
  else rank = rankBetween(await edgeRank(db, status, "last"), null);

  const now = new Date();
  await db.task.update({
    where: { id: task.id },
    data: {
      status,
      boardRank: rank,
      startedAt: status === "IN_PROGRESS" && !task.startedAt ? now : undefined,
      completedAt: status === "DONE" ? (task.status === "DONE" ? undefined : now) : null,
    },
  });
  return { rank };
}

export async function toggleChecklistItem(ctx: Ctx, rawInput: unknown): Promise<void> {
  const input = ToggleChecklistInput.parse(rawInput);
  const item = await db.taskChecklistItem.findFirst({
    where: { id: input.itemId, task: scoped(ctx, "EDIT") },
    select: { id: true },
  });
  if (!item) throw new NotFoundError("Checklist item");
  await db.taskChecklistItem.update({ where: { id: item.id }, data: { doneAt: input.done ? new Date() : null } });
}

export interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  checklist: { id: string; label: string; done: boolean }[];
  canEdit: boolean;
}

export async function getTaskDetail(ctx: Ctx, taskId: string): Promise<TaskDetail> {
  const task = await db.task.findFirst({
    where: { AND: [{ id: taskId }, scoped(ctx, "VIEW")] },
    include: { checklist: { orderBy: { position: "asc" } } },
  });
  if (!task) throw new NotFoundError("Task");
  let canEdit = false;
  try {
    canEdit = !!(await db.task.findFirst({ where: { AND: [{ id: taskId }, scoped(ctx, "EDIT")] }, select: { id: true } }));
  } catch {
    canEdit = false;
  }
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    checklist: task.checklist.map((c) => ({ id: c.id, label: c.label, done: !!c.doneAt })),
    canEdit,
  };
}
