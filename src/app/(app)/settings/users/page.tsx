import type { Metadata } from "next";
import { UsersAdmin } from "@/components/settings/users-admin";
import { MODULES } from "@/server/authz/catalog";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { db } from "@/server/db";
import { listUsers } from "@/server/modules/admin/users-service";
import { listUnits } from "@/server/modules/shell/service";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const ctx = await requireCtx();
  const [users, roles, units] = await Promise.all([
    listUsers(ctx),
    db.role.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, key: true } }),
    listUnits(),
  ]);
  return (
    <UsersAdmin
      users={users}
      roles={roles}
      units={units.map((u) => ({ id: u.id, code: u.code, name: u.name }))}
      modules={Object.entries(MODULES).map(([key, m]) => ({ key, label: m.label, sensitive: "sensitive" in m && m.sensitive === true }))}
      me={ctx.userId}
      can={{
        invite: can(ctx, "settings", "CREATE") || can(ctx, "hr.staff", "CREATE"),
        edit: can(ctx, "settings", "EDIT") || can(ctx, "hr.staff", "EDIT"),
        grants: can(ctx, "settings", "EDIT"),
        roles: can(ctx, "roles", "EDIT"),
      }}
    />
  );
}
