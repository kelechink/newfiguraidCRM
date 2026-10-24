import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDay, money } from "@/lib/format";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { vendorPosition } from "@/server/modules/finance/vendors-service";
import { Badge } from "@/ui/badge";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { StatCard } from "@/ui/stat";

export const metadata: Metadata = { title: "What we owe" };

export default async function VendorsPage() {
  const ctx = await requireCtx();
  if (!can(ctx, "finance.bills", "VIEW") && !can(ctx, "subscriptions", "VIEW")) notFound();
  const v = await vendorPosition(ctx);
  const today = new Date().toISOString().slice(0, 10);
  const stale = v.rates.filter((r) => r.stale);
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Unpaid bills" value={money(v.totals.billsNgn, "NGN", { compact: true })} sub={v.totals.overdueNgn > 0 ? `${money(v.totals.overdueNgn, "NGN", { compact: true })} overdue` : "Nothing overdue"} tone={v.totals.overdueNgn > 0 ? "danger" : undefined} />
        <StatCard label="Due in 30 days" value={money(v.totals.due30Ngn, "NGN", { compact: true })} sub="Bills and subscription renewals" />
        <StatCard label="Subscriptions per month" value={money(v.totals.monthlyRecurringNgn, "NGN", { compact: true })} />
        <StatCard label="Prepaid with vendors" value={money(v.totals.prepaidNgn, "NGN", { compact: true })} sub="Telecom balances we hold" />
      </div>
      <p className="text-[12.5px] text-ink-3">
        Naira at today's rates: {v.rates.map((r) => `1 ${r.currency} = ₦${r.rate.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`).join(" · ")}. <Link href="/money/rates" className="text-accent hover:underline">{stale.length ? `${stale.map((s) => s.currency).join(", ")} rate out of date — update` : "Change rates"}</Link>
      </p>
      {v.rows.length === 0 && <Card><p className="text-[13px] text-ink-3">No unpaid bills, subscriptions or prepaid balances.</p></Card>}
      {v.rows.map((r) => (
        <Card key={r.vendor} padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <p className="font-medium">{r.vendor}</p>
              <p className="text-2xs text-ink-3">Billed in {r.currencies.join(", ")}{r.nextDue && ` · next due ${formatDay(r.nextDue)}`}</p>
            </div>
            <div className="text-right">
              <p className="text-[15px] font-semibold tabular">{money(r.owedNgn)}</p>
              {r.overdueNgn > 0 && <p className="text-2xs font-medium text-danger">{money(r.overdueNgn)} overdue</p>}
            </div>
          </div>
          <ul className="divide-y divide-line">
            {r.items.map((i, k) => (
              <li key={k}>
                <Link href={i.href} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-[13px] hover:bg-surface-2/60">
                  <span>
                    {i.label}
                    <span className="block text-2xs text-ink-3">
                      {i.kind === "prepaid" ? "Credit we hold" : i.kind === "subscription" ? `Renews ${formatDay(i.due!)}` : `Due ${formatDay(i.due!)}`}
                      {i.kind === "bill" && i.status === "DISPUTED" && " · disputed"}
                    </span>
                  </span>
                  <span className="flex items-center gap-3 text-right">
                    {i.kind === "bill" && i.due! < today && <Badge tone="danger">Overdue</Badge>}
                    {i.kind === "prepaid" && i.status === "LOW" && <Badge tone="danger">Low</Badge>}
                    <span>
                      <span className={cn("block tabular", i.kind === "prepaid" ? "text-success" : "font-medium")}>{money(i.amount, i.currency)}</span>
                      {i.currency !== "NGN" && <span className="block text-2xs text-ink-3 tabular">{money(i.ngn)}</span>}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      <p className="text-2xs text-ink-3">Bills come from Finance → Bills and telecom vendor statements; subscriptions from Finance → Subscriptions.</p>
    </div>
  );
}
