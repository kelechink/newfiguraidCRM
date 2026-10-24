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

// ── CRM ──
import { contactWhere, dealWhere } from "@/server/modules/crm/scope";

registerSearch(async (ctx, q) => {
  if (!scopeOf(ctx, "crm.contacts", "VIEW")) return [];
  const digits = q.replace(/\D/g, "");
  const rows = await db.contact.findMany({
    where: { AND: [contactWhere(ctx, "VIEW"), { OR: [{ displayName: contains(q) }, { email: contains(q) }, ...(digits.length >= 4 ? [{ phoneE164: { contains: digits } }] : []), { company: { name: contains(q) } }] }] },
    take: 6,
    orderBy: { lastActivityAt: { sort: "desc", nulls: "last" } },
    include: { company: { select: { name: true } } },
  });
  return rows.map((c) => ({ id: c.id, kind: "Contact", title: c.displayName, subtitle: c.company?.name ?? c.email ?? c.phoneE164 ?? undefined, href: `/customers/contacts/${c.id}` }));
});

registerSearch(async (ctx, q) => {
  if (!scopeOf(ctx, "crm.deals", "VIEW")) return [];
  const rows = await db.deal.findMany({ where: { AND: [dealWhere(ctx, "VIEW"), { title: contains(q) }] }, take: 5, orderBy: { updatedAt: "desc" }, include: { stage: { select: { name: true } } } });
  return rows.map((d) => ({ id: d.id, kind: "Deal", title: d.title, subtitle: d.stage.name, href: `/customers/pipelines?p=${d.pipelineId}&deal=${d.id}` }));
});

// ── Finance ──
import { invoiceWhere } from "@/server/modules/finance/scope";

registerSearch(async (ctx, q) => {
  if (!scopeOf(ctx, "finance.invoices", "VIEW")) return [];
  const rows = await db.invoice.findMany({
    where: { AND: [invoiceWhere(ctx, "VIEW"), { OR: [{ number: contains(q) }, { contact: { displayName: contains(q) } }, { company: { name: contains(q) } }] }] },
    take: 5,
    orderBy: { issueDate: "desc" },
    include: { contact: { select: { displayName: true } }, company: { select: { name: true } } },
  });
  return rows.map((i) => ({ id: i.id, kind: i.kind === "QUOTE" ? "Quote" : "Invoice", title: i.number, subtitle: `${i.company?.name ?? i.contact?.displayName ?? ""} · ${i.status.replace("_", " ").toLowerCase()}`, href: `/money/invoices/${i.id}` }));
});
