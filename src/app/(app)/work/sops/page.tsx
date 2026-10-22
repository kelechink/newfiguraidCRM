import type { Metadata } from "next";
import { SopLibrary } from "@/components/sops/sop-library";
import { scopeOf } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { currentUnit, listUnits } from "@/server/modules/shell/service";
import { listSops } from "@/server/modules/sops/service";
import { listAssignableUsers } from "@/server/modules/users/service";

export const metadata: Metadata = { title: "SOP templates" };

export default async function SopsPage() {
  const ctx = await requireCtx();
  const unit = await currentUnit();
  const createScope = scopeOf(ctx, "sops", "CREATE");
  const canManage = createScope === "ALL" || createScope === "UNIT";

  const [sops, assignable, units] = await Promise.all([
    listSops(ctx, { unitId: unit?.id ?? null }),
    canManage ? listAssignableUsers(ctx, "sops") : Promise.resolve([]),
    listUnits(),
  ]);
  const manageableUnits = units
    .filter((u) => createScope === "ALL" || ctx.unitIds.includes(u.id))
    .map((u) => ({ id: u.id, code: u.code, name: u.name }));

  return <SopLibrary sops={sops} canManage={canManage} assignable={assignable} units={manageableUnits} />;
}
