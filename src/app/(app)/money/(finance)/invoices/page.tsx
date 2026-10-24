import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { describeDue, formatDay, money } from "@/lib/format";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { listInvoices } from "@/server/modules/finance/invoices-service";
import { currentUnit } from "@/server/modules/shell/service";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { StatusBadge } from "@/ui/status";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";
import { LinkTabs } from "@/ui/tabs";
import { UNIT_STYLE } from "@/ui/units";

export const metadata: Metadata = { title: "Invoices" };

const VIEWS = {
  all: { label: "All", filter: {} },
  open: { label: "Open", filter: { status: "OPEN" } },
  overdue: { label: "Overdue", filter: { status: "OVERDUE" } },
  drafts: { label: "Drafts", filter: { status: "DRAFT" } },
  quotes: { label: "Quotes", filter: { kind: "QUOTE" } },
} as const;

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const view = (sp.view && sp.view in VIEWS ? sp.view : "all") as keyof typeof VIEWS;
  const unit = await currentUnit();
  const rows = await listInvoices(ctx, { ...VIEWS[view].filter, unitId: unit?.id ?? null, q: sp.q || undefined });
  const outstanding = rows.filter((r) => ["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(r.status)).reduce((n, r) => n + (r.total - r.amountPaid) * (r.currency === "NGN" ? 1 : 0), 0);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <LinkTabs tabs={Object.entries(VIEWS).map(([k, v]) => ({ key: k, label: v.label, href: k === "all" ? "/money/invoices" : `/money/invoices?view=${k}` }))} active={view} />
        <form className="ml-auto" action="/money/invoices">
          {view !== "all" && <input type="hidden" name="view" value={view} />}
          <input name="q" defaultValue={sp.q} placeholder="Search number or customer" className="h-8 w-56 rounded-md border border-line bg-surface px-2.5 text-[13px] placeholder:text-ink-3 focus:border-accent focus:outline-none" />
        </form>
        {can(ctx, "finance.invoices", "CREATE") && (
          <Link href={view === "quotes" ? "/money/invoices/new?kind=QUOTE" : "/money/invoices/new"} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent/90">
            <Plus className="size-3.5" /> {view === "quotes" ? "New quote" : "New invoice"}
          </Link>
        )}
      </div>
      {view !== "quotes" && view !== "drafts" && outstanding > 0 && <p className="text-[13px] text-ink-3">{money(outstanding)} outstanding in naira on the invoices shown.</p>}
      <Card padded={false}>
        <Table>
          <THead><tr><Th>Number</Th><Th>Customer</Th><Th>Issued</Th><Th>Due</Th><Th align="right">Total</Th><Th align="right">Balance</Th><Th>Status</Th></tr></THead>
          <tbody>
            {rows.length === 0 && <TableEmpty colSpan={7}>{view === "quotes" ? "No quotes yet." : "No invoices match."}</TableEmpty>}
            {rows.map((i) => {
              const open = ["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(i.status);
              const due = open ? describeDue(i.dueDate) : null;
              return (
                <Tr key={i.id} href={`/money/invoices/${i.id}`}>
                  <Td><Link href={`/money/invoices/${i.id}`} className="inline-flex items-center gap-2 font-mono text-[12.5px] font-medium hover:text-accent"><span className={cn("size-1.5 rounded-full", UNIT_STYLE[i.unit]?.dot)} />{i.number}</Link></Td>
                  <Td className="max-w-[240px] truncate">{i.customer}</Td>
                  <Td muted className="whitespace-nowrap">{formatDay(i.issueDate)}</Td>
                  <Td className={cn("whitespace-nowrap", due?.tone === "overdue" ? "font-medium text-danger" : "text-ink-3")}>{due ? due.label : formatDay(i.dueDate)}</Td>
                  <Td align="right">{money(i.total, i.currency)}</Td>
                  <Td align="right" className="font-medium">{open ? money(i.total - i.amountPaid, i.currency) : "—"}</Td>
                  <Td><StatusBadge status={i.status} /></Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
