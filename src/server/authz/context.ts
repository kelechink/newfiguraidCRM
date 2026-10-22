import "server-only";
import type { PermAction, PermModule, PermScope } from "./catalog";
import { isModule, widerScope } from "./catalog";
import { ForbiddenError } from "./errors";
import { db } from "@/server/db";

/** Everything an authorised request knows about its caller. Built per request, never trusted from the client. */
export interface Ctx {
  userId: string;
  name: string;
  roleKey: string;
  status: string;
  unitIds: string[]; // primary unit + memberships → the UNIT scope
  perms: ReadonlyMap<string, PermScope>; // "module:ACTION" → widest scope held
}

/** Modules a user may use while their contract pack is unsigned (PRD Module L). */
const ONBOARDING_MODULES: ReadonlySet<string> = new Set(["attendance"]);

export async function loadCtx(userId: string): Promise<Ctx> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      role: { include: { permissions: true } },
      units: true,
      grants: { where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } },
    },
  });

  const perms = new Map<string, PermScope>();
  const add = (module: string, action: PermAction, scope: PermScope) => {
    if (!isModule(module)) return; // unknown keys never grant anything
    const key = `${module}:${action}`;
    const held = perms.get(key);
    perms.set(key, held ? widerScope(held, scope) : scope);
  };
  for (const p of user.role.permissions) add(p.module, p.action, p.scope);
  for (const g of user.grants) add(g.module, g.action, g.scope);

  const unitIds = new Set(user.units.map((u) => u.unitId));
  if (user.primaryUnitId) unitIds.add(user.primaryUnitId);

  return { userId: user.id, name: user.name, roleKey: user.role.key, status: user.status, unitIds: [...unitIds], perms };
}

export function scopeOf(ctx: Ctx, module: PermModule, action: PermAction): PermScope | null {
  if (ctx.status !== "ACTIVE" && !(ctx.status === "ONBOARDING" && ONBOARDING_MODULES.has(module))) return null;
  return ctx.perms.get(`${module}:${action}`) ?? null;
}

/** Deny by default: throws unless the caller holds the permission at some scope. */
export function requireScope(ctx: Ctx, module: PermModule, action: PermAction): PermScope {
  const scope = scopeOf(ctx, module, action);
  if (!scope) throw new ForbiddenError(`${module}:${action}`);
  return scope;
}

export function can(ctx: Ctx, module: PermModule, action: PermAction): boolean {
  return scopeOf(ctx, module, action) !== null;
}
