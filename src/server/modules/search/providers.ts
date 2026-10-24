import "server-only";
// Scoped search providers. Each returns nothing if the caller lacks VIEW on that module.
import { can, scopeOf } from "@/server/authz/context";
import { db } from "@/server/db";
import { taskScopeWhere } from "@/server/modules/tasks/service";
import { registerSearch } from "./service";

const contains = (q: string) => ({ contains: q, mode: "insensitive" as const });

registerSearch(async (ctx, q) => {
  const scope = scopeOf(ctx, "tasks", "VIEW");
  if (!scope) return [];
  const rows = await db.task.findMany({ where: { AND: [taskScopeWhere(ctx, scope), { title: contains(q) }] }, take: 6, orderBy: { updatedAt: "desc" } });
  return rows.map((t) => ({ id: t.id, kind: "Task", title: t.title, subtitle: t.status.replace("_", " ").toLowerCase(), href: `/work/tasks?task=${t.id}` }));
});

registerSearch(async (ctx, q) => {
  if (!can(ctx, "settings", "VIEW") && !can(ctx, "hr.staff", "VIEW") && !can(ctx, "messaging", "VIEW")) return [];
  const rows = await db.user.findMany({ where: { status: { in: ["ACTIVE", "ONBOARDING"] }, OR: [{ name: contains(q) }, { email: contains(q) }] }, take: 5 });
  return rows.map((u) => ({ id: u.id, kind: "Person", title: u.name, subtitle: u.email, href: can(ctx, "hr.staff", "VIEW") ? `/team/staff/${u.id}` : `/work/messages?dm=${u.id}` }));
});
