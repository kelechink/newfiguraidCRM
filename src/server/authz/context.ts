import "server-only";
import type { PermAction, PermModule, PermScope } from "./catalog";
import { isModule, widerScope } from "./catalog";
import { ForbiddenError } from "./errors";
import { db } from "@/server/db";

/** Everything an authorised request knows about its caller. Built per request, never trusted from the client. */
export interface Ctx {
  userId: string;
  name: string;
  email: string;
  roleKey: string;
  roleName: string;
  status: string;
  sessionId: string | null; // null in tests / background jobs
  unitIds: string[]; // primary unit + memberships → the UNIT scope
  primaryUnitId: string | null;
  perms: ReadonlyMap<string, PermScope>; // "module:ACTION" → widest scope held
  requires2fa: boolean;
  has2fa: boolean;
}

/** Modules a user may use while their contract pack is unsigned (PRD Module L). */
const ONBOARDING_MODULES: ReadonlySet<string> = new Set(["attendance", "dashboard.today", "documents", "messaging", "announcements"]);

export async function loadCtx(userId: string, sessionId: string | null = null): Promise<Ctx> {
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

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    roleKey: user.role.key,
    roleName: user.role.name,
    status: user.status,
    sessionId,
    unitIds: [...unitIds],
    primaryUnitId: user.primaryUnitId,
    perms,
    requires2fa: user.role.requires2fa,
    has2fa: !!user.twoFactorEnabledAt,
  };
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

export function canAll(ctx: Ctx, module: PermModule, action: PermAction): boolean {
  return scopeOf(ctx, module, action) === "ALL";
}

/**
 * Turn a scope into a Prisma `where` for a model. Every module service calls this
 * with how "my unit" and "mine" map onto its own columns.
 */
export function scopeWhere<W extends object>(
  ctx: Ctx,
  scope: PermScope,
  map: { unit: (unitIds: string[]) => W; own: (userId: string) => W },
): W | Record<string, never> {
  switch (scope) {
    case "ALL":
      return {};
    case "UNIT":
      return map.unit(ctx.unitIds);
    case "OWN":
      return map.own(ctx.userId);
  }
}

/** Shorthand: require the permission and return the scoped where in one call. */
export function scoped<W extends object>(
  ctx: Ctx,
  module: PermModule,
  action: PermAction,
  map: { unit: (unitIds: string[]) => W; own: (userId: string) => W },
): W | Record<string, never> {
  return scopeWhere(ctx, requireScope(ctx, module, action), map);
}

/** True if the caller may act on a record in `unitId` owned by `ownerId` at the given action. */
export function canOnRecord(ctx: Ctx, module: PermModule, action: PermAction, rec: { unitId?: string | null; ownerIds: (string | null | undefined)[] }): boolean {
  const scope = scopeOf(ctx, module, action);
  if (!scope) return false;
  if (scope === "ALL") return true;
  if (scope === "UNIT") return !!rec.unitId && ctx.unitIds.includes(rec.unitId);
  return rec.ownerIds.includes(ctx.userId);
}

/** Restrict a requested unit to what the caller may touch at UNIT scope. */
export function assertUnitInScope(ctx: Ctx, scope: PermScope, unitId: string, message = "You can only do that in your own unit") {
  if (scope === "ALL") return;
  if (!ctx.unitIds.includes(unitId)) throw new ForbiddenError(message);
}
