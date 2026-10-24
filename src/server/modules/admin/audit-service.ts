import "server-only";
import { z } from "zod";
import { auditHash } from "@/server/audit/audit";
import { requireScope, type Ctx } from "@/server/authz/context";
import { db } from "@/server/db";

const Filter = z.object({
  action: z.string().max(80).optional(),
  actorId: z.string().max(40).optional(),
  entity: z.string().max(80).optional(),
  before: z.string().max(40).optional(), // cursor: ISO time
});

export async function listAudit(ctx: Ctx, raw: unknown) {
  requireScope(ctx, "audit", "VIEW");
  const f = Filter.parse(raw ?? {});
  const rows = await db.auditLog.findMany({
    where: {
      ...(f.action ? { action: { startsWith: f.action } } : {}),
      ...(f.actorId ? { actorId: f.actorId } : {}),
      ...(f.entity ? { OR: [{ entityType: f.entity }, { entityId: f.entity }] } : {}),
      ...(f.before ? { at: { lt: new Date(f.before) } } : {}),
    },
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: 100,
    include: { actor: { select: { id: true, name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    actor: r.actor,
    actorType: r.actorType,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    before: r.before,
    after: r.after,
    ip: r.ip,
  }));
}

/** Walks the whole chain: each row must hash to its stored hash and point at the previous row. */
export async function verifyAuditChain(ctx: Ctx): Promise<{ ok: boolean; checked: number; brokenAt?: string }> {
  requireScope(ctx, "audit", "VIEW");
  let prevHash: string | null = null;
  let checked = 0;
  let cursor: { at: Date; id: string } | null = null;
  for (;;) {
    const batch: Awaited<ReturnType<typeof db.auditLog.findMany>> = await db.auditLog.findMany({
      where: cursor ? { OR: [{ at: { gt: cursor.at } }, { at: cursor.at, id: { gt: cursor.id } }] } : {},
      orderBy: [{ at: "asc" }, { id: "asc" }],
      take: 2000,
    });
    if (!batch.length) break;
    for (const r of batch) {
      const expected = auditHash({ prevHash: r.prevHash, at: r.at, actorId: r.actorId, actorType: r.actorType, action: r.action, entityType: r.entityType, entityId: r.entityId, unitId: r.unitId, before: r.before, after: r.after });
      if (r.prevHash !== prevHash || r.hash !== expected) return { ok: false, checked, brokenAt: r.id };
      prevHash = r.hash;
      checked++;
    }
    const last = batch.at(-1)!;
    cursor = { at: last.at, id: last.id };
  }
  return { ok: true, checked };
}
