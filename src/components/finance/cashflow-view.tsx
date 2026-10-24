"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatDay, money } from "@/lib/format";
import type { forecast } from "@/server/modules/finance/cashflow-service";
import { Card, CardHeader } from "@/ui/card";
import { TrendChart } from "@/ui/charts";
import { cn } from "@/ui/cn";

type Data = Awaited<ReturnType<typeof forecast>>;
const KIND: Record<string, string> = { receivable: "Invoices due to us", pipeline: "Weighted pipeline", telecom_in: "Telecom receipts (projected)", telecom_out: "Telecom vendor payments", topup: "Prepaid top-ups", payroll: "Payroll", subscription: "Subscriptions", recurring: "Recurring costs", payable: "Bills due" };

export function CashflowView({ data }: { data: Data }) {
  const [scenario, setScenario] = useState<"best" | "expected" | "worst">("expected");
  const weeks = data.scenarios[scenario];
  const low = weeks.filter((w) => w.belowMinimum);
  const rows = weeks.map((w, i) => ({
    label: formatDay(w.weekStart),
    best: data.scenarios.best[i]!.closing,
    expected: data.scenarios.expected[i]!.closing,
    worst: data.scenarios.worst[i]!.closing,
  }));
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {[30, 60, 90].map((d) => (
          <Link key={d} href={`/money/cashflow?days=${d}`} className={cn("h-8 rounded-lg border px-3 text-[13px] font-medium leading-8", d === data.days ? "border-line bg-surface shadow-card" : "border-transparent text-ink-3")}>{d} days</Link>
        ))}
        <div className="ml-auto flex gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5" role="radiogroup" aria-label="Scenario">
          {(["best", "expected", "worst"] as const).map((s) => (
            <button key={s} role="radio" aria-checked={scenario === s} onClick={() => setScenario(s)} className={cn("h-7 rounded-md px-3 text-[12.5px] font-medium capitalize", scenario === s ? "bg-surface shadow-card" : "text-ink-3")}>{s} case</button>
          ))}
        </div>
      </div>
      {low.length > 0 ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-[13px]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
          <span>In the {scenario} case, cash drops below the {money(data.minimum, "NGN", { compact: true })} minimum in {low.length} week{low.length === 1 ? "" : "s"}, first in the week of <b>{formatDay(low[0]!.weekStart, { weekday: true })}</b> ({money(low[0]!.closing, "NGN", { compact: true })}).</span>
        </div>
      ) : (
        <p className="text-[13px] text-ink-3">In the {scenario} case cash stays above the {money(data.minimum, "NGN", { compact: true })} minimum for the next {data.days} days.</p>
      )}
      <Card>
        <CardHeader title="Projected cash balance" description={`Starting from ${money(data.opening, "NGN", { compact: true })} in the bank. Weekly closing balance, NGN.`} />
        <TrendChart
          data={rows}
          xKey="label"
          reference={{ value: data.minimum, label: "Minimum balance" }}
          series={[
            { key: "best", label: "Best case", token: "series-profit", dashed: true },
            { key: "expected", label: "Expected", token: "ink", width: 2 },
            { key: "worst", label: "Worst case", token: "series-expense", dashed: true },
          ]}
        />
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="What drives it" description="Expected-case totals over the period." />
          <ul className="grid gap-1.5">
            {data.byKind.sort((a, b) => b.amount - a.amount).map((k) => (
              <li key={k.kind} className="flex justify-between text-[13px]"><span className="text-ink-2">{KIND[k.kind] ?? k.kind}</span><span className={cn("tabular font-medium", k.amount < 0 && "text-ink")}>{money(k.amount, "NGN", { compact: true })}</span></li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Largest movements" />
          <ul className="grid gap-1.5">
            {data.largest.map((f, i) => (
              <li key={i} className="grid grid-cols-[72px_1fr_auto] gap-2 text-[12.5px]">
                <span className="text-ink-3 tabular">{formatDay(f.date)}</span>
                <span className="truncate">{f.label}{f.amount > 0 && f.probability < 1 && <span className="text-ink-3"> · {Math.round(f.probability * 100)}%</span>}</span>
                <span className="tabular font-medium">{money(f.amount, "NGN", { compact: true })}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
