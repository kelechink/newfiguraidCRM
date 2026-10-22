import type { Metadata } from "next";
import { TaskBoard } from "@/components/tasks/board";
import { originForCreator } from "@/domain/tasks/origin";
import { requireScope, scopeOf } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { currentUnit, listUnits } from "@/server/modules/shell/service";
import { listBoard } from "@/server/modules/tasks/service";
import { listAssignableUsers } from "@/server/modules/users/service";

export const metadata: Metadata = { title: "Tasks" };

const ORIGINS = ["FOUNDER", "TEAM_LEAD", "SOP"] as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ origin?: string }> }) {
  const ctx = await requireCtx();
  const viewScope = requireScope(ctx, "tasks", "VIEW");
  const createScope = scopeOf(ctx, "tasks", "CREATE");
  const canCreate = createScope === "ALL" || createScope === "UNIT";
  const unit = await currentUnit();
  const { origin } = await searchParams;

  const [tasks, assignable, units] = await Promise.all([
    listBoard(ctx, { unitId: unit?.id ?? null }),
    canCreate ? listAssignableUsers(ctx, "tasks") : Promise.resolve([]),
    listUnits(),
  ]);
  const creatableUnits = units
    .filter((u) => createScope === "ALL" || ctx.unitIds.includes(u.id))
    .filter((u) => !unit || u.id === unit.id)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }));

  return (
    <TaskBoard
      initialTasks={tasks}
      me={ctx.userId}
      canCreate={canCreate && creatableUnits.length > 0}
      createOrigin={originForCreator(ctx.roleKey)}
      assignable={assignable}
      units={creatableUnits}
      initialOrigin={(ORIGINS as readonly string[]).includes(origin ?? "") ? (origin as (typeof ORIGINS)[number]) : "ALL"}
      showMineToggle={viewScope !== "OWN"}
    />
  );
}
