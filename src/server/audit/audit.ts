import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export interface AuditEntry {
  actorId: string | null;
  actorType?: "user" | "system" | "webhook" | "ai";
  action: string; // "task.create", "sop.generate"
  entityType?: string;
  entityId?: string;
  unitId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

// Arbitrary constant: serialises writers so each row chains to the true previous hash.
const AUDIT_LOCK_KEY = 7_311_002;

/** Append one hash-chained row. Call inside the same transaction as the change it records. */
export async function audit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`;
  const prev = await tx.auditLog.findFirst({ orderBy: [{ at: "desc" }, { id: "desc" }], select: { hash: true } });
  const at = new Date();
  const body = JSON.stringify({ ...entry, at: at.toISOString(), prevHash: prev?.hash ?? null });
  const hash = createHash("sha256").update(body).digest("hex");
  await tx.auditLog.create({
    data: {
      at,
      actorId: entry.actorId,
      actorType: entry.actorType ?? "user",
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      unitId: entry.unitId ?? null,
      before: entry.before,
      after: entry.after,
      prevHash: prev?.hash ?? null,
      hash,
    },
  });
}
