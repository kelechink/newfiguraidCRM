import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FinanceOverviewChart } from "@/components/finance/overview-chart";
import { AGE_BUCKETS } from "@/domain/finance/money";
import { money } from "@/lib/format";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { ageingReport, cashInSummary, moneyInOut } from "@/server/modules/finance/reports-service";
import { currentUnit } from "@/server/modules/shell/service";
import { Card, CardHeader } from "@/ui/card";
import { cn } from "@/ui/cn";
import { pctChange, StatCard } from "@/ui/stat";
import { Table, Td, Th, THead, Tr } from "@/ui/table";
import { UNIT_STYLE } from "@/ui/units";

export const metadata: Metadata = { title: "Finance" };

export default async function FinanceOverview() {
  const ctx = await requireCtx();
  if (!can(ctx, "finance.reports", "VIEW")) redirect(can(ctx, "finance.expenses", "VIEW") ? "/money/expenses" : "/");
  const unit = await currentUnit();
  const [flow, aged, cash] = await Promise.all([moneyInOut(ctx, { months: 6, unitId: unit?.id ?? null }), ageingReport(ctx, unit?.id ?? null), cashInSummary(ctx, unit?.id ?? null)]);
  const cur = flow.rows.at(-1)!.total;
  const prev = flow.rows.at(-2)?.total ?? { in: 0, out: 0, profit: 0 };
  const recv = AGE_BUCKETS.reduce((n, b) => n + aged.receivables[b], 0);
  const pay = AGE_BUCKETS.reduce((n, b) => n + aged.payables[b], 0);
  const monthName = (m: string) => new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${m}-15`));

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Cash in this month" value={money(cur.in, "NGN", { compact: true })} trend={pctChange(cur.in, prev.in)} sub={`today ${money(cash.today, "NGN", { compact: true })}`} href="/money/payments" />
        <StatCard label="Money out this month" value={money(cur.out, "NGN", { compact: true })} trend={pctChange(cur.out, prev.out)} goodWhen="down" href="/money/expenses" />
        <StatCard label="Profit this month" value={money(cur.profit, "NGN", { compact: true })} trend={pctChange(cur.profit, prev.profit)} tone={cur.profit < 0 ? "danger" : undefined} />
        <StatCard label="Receivables" value={money(recv, "NGN", { compact: true })} sub={`${money(aged.receivables["90+"], "NGN", { compact: true })} over 90 days`} href="/money/invoices?status=OPEN" tone={aged.receivables["90+"] > 0 ? "warning" : undefined} />
        <StatCard label="Payables" value={money(pay, "NGN", { compact: true })} href="/money/bills" />
      </div>

      <Card>
        <CardHeader title="Money in vs out" description="Cash received against costs booked, last 6 months (NGN)." />
        <FinanceOverviewChart rows={flow.rows.map((r) => ({ label: monthName(r.month), in: r.total.in, out: r.total.out, profit: r.total.profit }))} />
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card padded={false}>
          <div className="p-4 pb-2 sm:p-5 sm:pb-2"><CardHeader title="By unit" description="This month and last." /></div>
          <Table>
            <THead><tr><Th>Unit</Th><Th align="right">In</Th><Th align="right">Out</Th><Th align="right">Profit</Th><Th align="right">Last month profit</Th></tr></THead>
            <tbody>
              {flow.units.map((u) => {
                const now = flow.rows.at(-1)!.byUnit[u.code]!;
                const before = flow.rows.at(-2)?.byUnit[u.code];
                return (
                  <Tr key={u.id}>
                    <Td><span className="inline-flex items-center gap-2 font-medium"><span className={cn("size-2 rounded-full", UNIT_STYLE[u.code]?.dot)} />{u.name}</span></Td>
                    <Td align="right">{money(now.in)}</Td>
                    <Td align="right">{money(now.out)}</Td>
                    <Td align="right" className={cn("font-semibold", now.profit < 0 && "text-danger")}>{money(now.profit)}</Td>
                    <Td align="right" muted>{before ? money(before.profit) : "—"}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Ageing" description="Outstanding by days past due (NGN)." />
          <table className="w-full text-[12.5px]">
            <thead><tr className="text-left text-2xs uppercase tracking-[0.04em] text-ink-3"><th className="pb-1.5 font-medium" /><th className="pb-1.5 text-right font-medium">Owed to us</th><th className="pb-1.5 text-right font-medium">We owe</th></tr></thead>
            <tbody>
              {AGE_BUCKETS.map((b) => (
                <tr key={b} className="border-t border-line">
                  <td className="py-1.5 text-ink-2">{b === "current" ? "Not yet due" : `${b} days`}</td>
                  <td className={cn("py-1.5 text-right tabular", (b === "61-90" || b === "90+") && aged.receivables[b] > 0 && "font-medium text-danger")}>{money(aged.receivables[b], "NGN", { compact: true })}</td>
                  <td className="py-1.5 text-right tabular">{money(aged.payables[b], "NGN", { compact: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
