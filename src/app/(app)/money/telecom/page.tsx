import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TelecomTrend } from "@/components/telecom/overview";
import { money, num, pct } from "@/lib/format";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { telecomSummary } from "@/server/modules/telecom/traffic-service";
import { Badge } from "@/ui/badge";
import { Card, CardHeader } from "@/ui/card";
import { cn } from "@/ui/cn";
import { StatCard } from "@/ui/stat";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";
import { LinkTabs } from "@/ui/tabs";

export const metadata: Metadata = { title: "Telecom" };

const RANGES = { "7": "7 days", "30": "30 days", "90": "90 days" } as const;

export default async function TelecomOverview({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const ctx = await requireCtx();
  if (!can(ctx, "telecom.traffic", "VIEW")) notFound();
  const range = ((await searchParams).range ?? "30") as keyof typeof RANGES;
  const days = Number(range in RANGES ? range : "30");
  const to = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  to.setUTCDate(to.getUTCDate() + 1);
  const from = new Date(to.getTime() - days * 86_400_000);
  const s = await telecomSummary(ctx, { from, to });
  const alerts = s.byRoute.filter((r) => r.alert);
  const cur = s.currency;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <LinkTabs tabs={Object.entries(RANGES).map(([k, label]) => ({ key: k, label, href: `/money/telecom?range=${k}` }))} active={String(days)} />
      </div>
      <div className={cn("grid gap-3 sm:grid-cols-2", s.seeMargin ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
        <StatCard label="Billed minutes" value={num(s.total.minutes)} sub={s.total.asr != null ? `ASR ${pct(s.total.asr)} · ACD ${s.total.acd ?? "—"} min` : undefined} />
        <StatCard label="Revenue" value={money(s.total.revenue, cur)} />
        {s.seeMargin && <StatCard label="Margin" value={money(s.total.margin, cur)} sub={s.total.marginPct != null ? `${pct(s.total.marginPct)} of revenue` : undefined} tone={s.total.alert === "negative" ? "danger" : s.total.alert === "thin" ? "warning" : undefined} />}
        {s.seeMargin ? <StatCard label="Cost" value={money(s.total.cost, cur)} /> : <StatCard label="Customers trading" value={String(s.byCustomer.length)} />}
      </div>
      {alerts.length > 0 && (
        <Card className="border-warning/40">
          <p className="flex items-center gap-2 text-[13px] font-medium"><AlertTriangle className="size-4 text-warning" /> {alerts.length} route{alerts.length === 1 ? "" : "s"} below the margin threshold</p>
          <ul className="mt-2 grid gap-1 text-[13px] text-ink-2">
            {alerts.slice(0, 6).map((a) => (
              <li key={a.routeId} className="flex justify-between gap-3"><span>{a.name}</span><span className={cn("tabular", a.alert === "negative" ? "text-danger" : "text-warning")}>{money(a.margin, cur)} · {pct(a.marginPct ?? 0)}</span></li>
            ))}
          </ul>
        </Card>
      )}
      {s.byCurrency.length > 0 && (
        <Card padded={false}>
          <CardHeader title="By billing currency" description="Totals above are in naira at today's rates; carriers are billed in their own currency." className="px-4 pt-3" actions={<Link href="/money/rates" className="text-[12.5px] text-accent hover:underline">Exchange rates</Link>} />
          <Table>
            <THead><tr><Th>Currency</Th><Th align="right">Minutes</Th><Th align="right">Revenue</Th>{s.seeMargin && <Th align="right">Margin</Th>}<Th align="right">Rate</Th><Th align="right">Revenue in ₦</Th></tr></THead>
            <tbody>
              {s.byCurrency.map((c) => (
                <Tr key={c.currency}>
                  <Td className="font-medium">{c.currency}</Td>
                  <Td align="right" muted>{num(c.minutes)}</Td>
                  <Td align="right">{money(c.revenue, c.currency)}</Td>
                  {s.seeMargin && <Td align="right">{money(c.margin, c.currency)}</Td>}
                  <Td align="right" muted>{c.currency === "NGN" ? "—" : `₦${num(c.rate, 2)}`}</Td>
                  <Td align="right" className="font-medium">{money(c.revenue * c.rate)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <Card>
        <CardHeader title={s.seeMargin ? "Revenue, cost and margin" : "Billed minutes"} description={`Last ${days} days, by day of traffic, in naira`} />
        <TelecomTrend rows={s.byDay} currency={cur} seeMargin={s.seeMargin} />
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card padded={false}>
          <CardHeader title="Top routes" className="px-4 pt-3" actions={<Link href="/money/telecom/routes" className="text-[12.5px] text-accent hover:underline">All routes</Link>} />
          <Table>
            <THead><tr><Th>Route</Th><Th align="right">Minutes</Th><Th align="right">Revenue</Th>{s.seeMargin && <Th align="right">Margin</Th>}</tr></THead>
            <tbody>
              {s.byRoute.length === 0 && <TableEmpty colSpan={4}>No traffic in this period.</TableEmpty>}
              {s.byRoute.slice(0, 10).map((r) => (
                <Tr key={r.routeId}>
                  <Td className="max-w-[260px] truncate">{r.name}</Td>
                  <Td align="right" muted>{num(r.minutes)}</Td>
                  <Td align="right">{money(r.revenue, cur)}</Td>
                  {s.seeMargin && <Td align="right" className={cn("font-medium", r.alert === "negative" && "text-danger", r.alert === "thin" && "text-warning")}>{pct(r.marginPct ?? 0)}</Td>}
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card padded={false}>
          <CardHeader title="Customers" className="px-4 pt-3" />
          <Table>
            <THead><tr><Th>Customer</Th><Th align="right">Minutes</Th><Th align="right">Revenue</Th>{s.seeMargin && <Th align="right">Margin</Th>}</tr></THead>
            <tbody>
              {s.byCustomer.length === 0 && <TableEmpty colSpan={4}>No traffic in this period.</TableEmpty>}
              {s.byCustomer.slice(0, 10).map((r) => (
                <Tr key={r.name}>
                  <Td>{r.name}</Td>
                  <Td align="right" muted>{num(r.minutes)}</Td>
                  <Td align="right">{money(r.revenue, cur)}</Td>
                  {s.seeMargin && <Td align="right" className="font-medium">{r.alert ? <Badge tone={r.alert === "negative" ? "danger" : "warning"}>{pct(r.marginPct ?? 0)}</Badge> : pct(r.marginPct ?? 0)}</Td>}
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
