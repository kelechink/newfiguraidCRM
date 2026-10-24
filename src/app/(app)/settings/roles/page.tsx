import type { Metadata } from "next";
import { RolesEditor } from "@/components/settings/roles-editor";
import { ACTIONS, MODULES } from "@/server/authz/catalog";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { listRoles } from "@/server/modules/admin/roles-service";

export const metadata: Metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  const ctx = await requireCtx();
  const roles = await listRoles(ctx);
  const modules = Object.entries(MODULES).map(([key, m]) => ({ key, label: m.label, group: m.group, sensitive: "sensitive" in m && m.sensitive === true }));
  return <RolesEditor roles={roles} modules={modules} actions={[...ACTIONS]} canEdit={can(ctx, "roles", "EDIT")} />;
}
