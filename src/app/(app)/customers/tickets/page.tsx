import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewTicketButton } from "@/components/support/tickets";
import { ago, describeDue } from "@/lib/format";
import { can, scopeOf } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { listContacts } from "@/server/modules/crm/contacts-service";
import { currentUnit, listUnits } from "@/server/modules/shell/service";
import { listTickets, supportStats } from "@/server/modules/support/service";
import { listAssignableUsers } from "@/server/modules/users/service";
import { Badge } from "@/ui/badge";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { PageHeader } from "@/ui/page-header";
import { StatCard } from "@/ui/stat";
import { humanize, StatusBadge } from "@/ui/status";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";
import { LinkTabs } from "@/ui/tabs";
import { UNIT_STYLE } from "@/ui/units";

export const metadata: Metadata = { title: "Support tickets" };
const VIEWS = { open: "Open", mine: "Mine", breached: "SLA breached", resolved: "Resolved", all: "All" } as const;

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const ctx = await requireCtx();
  if (!can(ctx, "support.tickets", "VIEW")) notFound();
  const sp = await searchParams;
  const view = (sp.view && sp.view in VIEWS ? sp.view : "open") as keyof typeof VIEWS;
  const unit = await currentUnit();
  const canCreate = can(ctx, "support.tickets", "CREATE");
  const [rows, stats, units, contacts, people] = await Promise.all([
    listTickets(ctx, { view, unitId: unit?.id ?? null, q: sp.q }),
    supportStats(ctx),
    listUnits(),
    canCreate && can(ctx, "crm.contacts", "VIEW") ? listContacts(ctx, {}).then((r) => r.rows) : Promise.resolve([]),
    listAssignableUsers(ctx, "support.tickets"),
  ]);
  const scope = scopeOf(ctx, "support.tickets", "CREATE");
  const unitIds = new Map(units.map((u) => [u.code, u.id]));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Support tickets" description="Customer issues with response and resolution targets." actions={canCreate && contacts.length > 0 ? <NewTicketButton units={units.filter((u) => scope === "ALL" || ctx.unitIds.includes(u.id)).map((u) => ({ id: u.id, name: u.name }))} contacts={contacts.map((c) => ({ id: c.id, name: c.name, unitId: unitIds.get(c.unit) ?? "" }))} people={people.map((p) => ({ id: p.id, name: p.name }))} /> : undefined} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open" value={String(stats.open)} href="/customers/tickets" />
        <StatCard label="SLA breached" value={String(stats.breached)} tone={stats.breached ? "danger" : undefined} href="/customers/tickets?view=breached" />
        <StatCard label="First reply on time" value={stats.firstResponseOnTimePct != null ? `${stats.firstResponseOnTimePct}%` : "—"} sub={stats.medianResolutionHours != null ? `Median fix ${stats.medianResolutionHours} h (30 days)` : "Last 30 days"} />
        <StatCard label="Satisfaction" value={stats.csatAvg != null ? `${stats.csatAvg} / 5` : "—"} sub={`${stats.csatCount} rating${stats.csatCount === 1 ? "" : "s"} in 30 days`} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <LinkTabs tabs={Object.entries(VIEWS).map(([k, label]) => ({ key: k, label, href: `/customers/tickets?view=${k}` }))} active={view} />
        <form action="/customers/tickets" className="ml-auto"><input type="hidden" name="view" value={view} /><input name="q" defaultValue={sp.q} placeholder="Number, subject or customer" className="h-8 w-56 rounded-md border border-line bg-surface px-2.5 text-[13px] placeholder:text-ink-3 focus:border-accent focus:outline-none" /></form>
      </div>
      <Card padded={false}>
        <Table>
          <THead><tr><Th>Ticket</Th><Th>Customer</Th><Th>Priority</Th><Th>Due</Th><Th>Assignee</Th><Th>Status</Th></tr></THead>
          <tbody>
            {rows.length === 0 && <TableEmpty colSpan={6}>No tickets here.</TableEmpty>}
            {rows.map((t) => {
              const dueAt = !t.responded ? t.firstResponseDueAt : t.resolutionDueAt;
              const due = dueAt && !["RESOLVED", "CLOSED"].includes(t.status) ? describeDue(dueAt) : null;
              return (
                <Tr key={t.id} href={`/customers/tickets/${t.id}`}>
                  <Td>
                    <Link href={`/customers/tickets/${t.id}`} className="flex items-center gap-2 font-medium hover:text-accent"><span className={cn("size-1.5 rounded-full", UNIT_STYLE[t.unit]?.dot)} />{t.subject}</Link>
                    <p className="text-2xs text-ink-3">{t.number} · {ago(t.createdAt)}{t.category && ` · ${t.category}`}</p>
                  </Td>
                  <Td muted>{t.contact.displayName}</Td>
                  <Td><StatusBadge status={t.priority} label={humanize(t.priority)} /></Td>
                  <Td className={cn("whitespace-nowrap text-[12.5px]", t.breached ? "font-medium text-danger" : "text-ink-3")}>{due ? `${t.responded ? "Fix" : "Reply"} ${due.label}` : t.csat ? <Badge tone={t.csat >= 4 ? "success" : t.csat <= 2 ? "danger" : "neutral"}>{t.csat}/5</Badge> : "—"}</Td>
                  <Td muted>{t.assignee?.name ?? "—"}</Td>
                  <Td><StatusBadge status={t.status} /></Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
