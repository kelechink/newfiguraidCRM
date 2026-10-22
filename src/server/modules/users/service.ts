import "server-only";
import type { PermModule } from "@/server/authz/catalog";
import { scopeOf, type Ctx } from "@/server/authz/context";
import { db } from "@/server/db";

export interface AssignableUser {
  id: string;
  name: string;
  roleName: string;
  unitIds: string[];
}

/**
 * People the caller may assign work to via `module`'s CREATE permission:
 * everyone active for ALL scope, people sharing one of the caller's units for UNIT.
 */
export async function listAssignableUsers(ctx: Ctx, module: PermModule): Promise<AssignableUser[]> {
  const scope = scopeOf(ctx, module, "CREATE");
  if (scope !== "ALL" && scope !== "UNIT") return [];
  const users = await db.user.findMany({
    where: {
      status: "ACTIVE",
      ...(scope === "UNIT"
        ? { OR: [{ primaryUnitId: { in: ctx.unitIds } }, { units: { some: { unitId: { in: ctx.unitIds } } } }] }
        : {}),
    },
    select: { id: true, name: true, primaryUnitId: true, role: { select: { name: true } }, units: { select: { unitId: true } } },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    roleName: u.role.name,
    unitIds: [...new Set([...(u.primaryUnitId ? [u.primaryUnitId] : []), ...u.units.map((x) => x.unitId)])],
  }));
}
