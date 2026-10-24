import { redirect } from "next/navigation";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";

export default async function SettingsIndex() {
  const ctx = await requireCtx();
  if (can(ctx, "settings", "VIEW") || can(ctx, "hr.staff", "VIEW")) redirect("/settings/users");
  if (can(ctx, "audit", "VIEW")) redirect("/settings/audit");
  if (can(ctx, "inbox.routing", "VIEW")) redirect("/settings/routing");
  redirect("/");
}
