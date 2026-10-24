import type { Metadata } from "next";
import Link from "next/link";
import { RecordIncomeButton } from "@/components/finance/income-controls";
import { formatDay, money } from "@/lib/format";
import { can, scopeOf } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { bankAccounts, listPayments } from "@/server/modules/finance/money-service";
import { currentRates } from "@/server/fx/rates";
import { currentUnit, listUnits } from "@/server/modules/shell/service";
import { Badge } from "@/ui/badge";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { humanize, StatusBadge } from "@/ui/status";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";
import { UNIT_STYLE } from "@/ui/units";

export const metadata: Metadata = { title: "Income" };

export default async function PaymentsPage() {
  const ctx = await requireCtx();
  const unit = await currentUnit();
  const [rows, units, banks, usd] = await Promise.all([listPayments(ctx, { unitId: unit?.id ?? null }), listUnits(), bankAccounts(ctx), currentRates()]);
  const scope = scopeOf(ctx, "finance.income", "CREATE");
  const total = rows.reduce((n, p) => n + p.amountNgn, 0);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-3">{rows.length} payments · {money(total)} received. Paystack and WHMCS payments appear automatically once verified.</p>
        {can(ctx, "finance.income", "CREATE") && <RecordIncomeButton units={units.filter((u) => scope === "ALL" || ctx.unitIds.includes(u.id)).map((u) => ({ id: u.id, name: u.name }))} banks={banks} rates={usd} />}
      </div>
      <Card padded={false}>
        <Table>
          <THead><tr><Th>Date</Th><Th>From</Th><Th>Method</Th><Th>Reference</Th><Th align="right">Amount</Th><Th align="right">NGN</Th><Th>Status</Th></tr></THead>
          <tbody>
            {rows.length === 0 && <TableEmpty colSpan={7}>No payments yet.</TableEmpty>}
            {rows.map((p) => (
              <Tr key={p.id}>
                <Td muted className="whitespace-nowrap">{formatDay(p.receivedAt, { weekday: true })}</Td>
                <Td>
                  <span className="inline-flex items-center gap-2"><span className={cn("size-1.5 rounded-full", UNIT_STYLE[p.unit]?.dot)} />{p.payer}</span>
                  {p.invoice && <Link href={`/money/invoices/${p.invoice.id}`} className="ml-2 font-mono text-2xs text-accent hover:underline">{p.invoice.number}</Link>}
                </Td>
                <Td><Badge>{humanize(p.method)}</Badge></Td>
                <Td muted className="font-mono text-[12px]">{p.reference ?? "—"}</Td>
                <Td align="right">{money(p.amount, p.currency)}</Td>
                <Td align="right" className="font-medium">{money(p.amountNgn)}</Td>
                <Td><StatusBadge status={p.status} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
