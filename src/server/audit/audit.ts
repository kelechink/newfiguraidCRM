import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export interface AuditEntry {
  actorId: string | null;
  actorType?: "user" | "system" | "webhook" | "ai" | "external";
  action: string; // "task.create", "sop.generate", "rate.create", "export.csv"
  entityType?: string;
  entityId?: string;
  unitId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string | null;
}

// Arbitrary constant: serialises writers so each row chains to the true previous hash.
const AUDIT_LOCK_KEY = 7_311_002;

/** JSON with sorted keys — Postgres jsonb reorders keys, so hashes must not depend on order. */
export function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
      .join(",")}}`;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return "null";
  return JSON.stringify(value);
}

export function auditHash(row: {
  prevHash: string | null;
  at: Date;
  actorId: string | null;
  actorType: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  unitId: string | null;
  before: unknown;
  after: unknown;
}): string {
  const body = canonical([row.prevHash, row.at.toISOString(), row.actorId, row.actorType, row.action, row.entityType, row.entityId, row.unitId, row.before ?? null, row.after ?? null]);
  return createHash("sha256").update(body).digest("hex");
}

/** Append one hash-chained row. Call inside the same transaction as the change it records. */
export async function audit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`;
  const prev = await tx.auditLog.findFirst({ orderBy: [{ at: "desc" }, { id: "desc" }], select: { hash: true, at: true } });
  // strictly increasing timestamps keep the chain order unambiguous
  const now = new Date();
  const at = prev && prev.at >= now ? new Date(prev.at.getTime() + 1) : now;
  const row = {
    prevHash: prev?.hash ?? null,
    at,
    actorId: entry.actorId,
    actorType: entry.actorType ?? "user",
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    unitId: entry.unitId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  };
  // round-trip through JSON so what we hash is exactly what jsonb will store
  const before = row.before === null ? null : JSON.parse(JSON.stringify(row.before));
  const after = row.after === null ? null : JSON.parse(JSON.stringify(row.after));
  await tx.auditLog.create({
    data: {
      ...row,
      before: before ?? undefined,
      after: after ?? undefined,
      ip: entry.ip ?? null,
      hash: auditHash({ ...row, before, after }),
    },
  });
}
