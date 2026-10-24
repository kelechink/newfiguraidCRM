import "server-only";
import type { Prisma } from "@prisma/client";
import type { PermAction } from "@/server/authz/catalog";
import { requireScope, scopeOf, scopeWhere, type Ctx } from "@/server/authz/context";

/** Live (not merged/deleted) contacts the caller may act on. OWN = contacts they own. */
export function contactWhere(ctx: Ctx, action: PermAction): Prisma.ContactWhereInput {
  const scope = requireScope(ctx, "crm.contacts", action);
  return {
    AND: [
      { deletedAt: null, mergedIntoId: null },
      scopeWhere<Prisma.ContactWhereInput>(ctx, scope, { unit: (ids) => ({ unitId: { in: ids } }), own: (me) => ({ ownerId: me }) }),
    ],
  };
}

export function dealWhere(ctx: Ctx, action: PermAction): Prisma.DealWhereInput {
  const scope = requireScope(ctx, "crm.deals", action);
  return {
    AND: [
      { deletedAt: null },
      scopeWhere<Prisma.DealWhereInput>(ctx, scope, { unit: (ids) => ({ unitId: { in: ids } }), own: (me) => ({ ownerId: me }) }),
    ],
  };
}

/** Units the caller may create records in for a module at the given action. */
export function creatableUnits(ctx: Ctx, module: "crm.contacts" | "crm.deals" | "crm.forms", allUnitIds: string[]): string[] {
  const s = scopeOf(ctx, module, "CREATE");
  if (!s) return [];
  return s === "ALL" ? allUnitIds : ctx.unitIds;
}
