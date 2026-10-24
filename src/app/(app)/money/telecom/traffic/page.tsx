import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrafficButtons } from "@/components/telecom/traffic";
import { formatDateTime, formatDay, money, num, pct } from "@/lib/format";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { accountOptions } from "@/server/modules/telecom/carriers-service";
import { listRoutes } from "@/server/modules/telecom/rates-service";
import { listCdrImports, listTraffic } from "@/server/modules/telecom/traffic-service";
import { Badge } from "@/ui/badge";
import { Card, CardHeader } from "@/ui/card";
import { cn } from "@/ui/cn";
import { StatusBadge } from "@/ui/status";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";

export const metadata: Metadata = { title: "Traffic" };

export default async function TrafficPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await requireCtx();
  if (!can(ctx, "telecom.traffic", "VIEW")) notFound();
  const sp = await searchParams;
  const valid = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const toDay = valid(sp.to) ?? new Date().toISOString().slice(0, 10);
  const fromDay = valid(sp.from) ?? new Date(Date.parse(toDay) - 29 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(Date.parse(`${toDay}T00:00:00Z`) + 86_400_000);
  const canEnter = can(ctx, "telecom.traffic", "CREATE");
  const [rows, imports, routes, vendors, customers] = await Promise.all([
    listTraffic(ctx, { from: `${fromDay}T00:00:00Z`, to }),
    listCdrImports(ctx),
    canEnter && can(ctx, "telecom.routes", "VIEW") ? listRoutes(ctx, {}) : Promise.resolve([]),
    canEnter ? accountOptions(ctx, "VENDOR") : Promise.resolve([]),
    canEnter ? accountOptions(ctx, "CUSTOMER") : Promise.resolve([]),
  ]);
  const seeMargin = rows.some((r) => r.margin !== null);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <form action="/money/telecom/traffic" className="flex items-end gap-2">
          <label className="grid gap-1 text-2xs text-ink-3">From<input name="from" type="date" defaultValue={fromDay} className="h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink" /></label>
          <label className="grid gap-1 text-2xs text-ink-3">To<input name="to" type="date" defaultValue={toDay} className="h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink" /></label>
          <button className="h-8 rounded-md border border-line px-3 text-[13px] hover:bg-surface-2">Apply</button>
        </form>
        {canEnter && <div className="ml-auto"><TrafficButtons routes={routes.map((r) => ({ id: r.id, label: `${r.destination} · ${r.prefix} · ${r.routeType}` }))} vendors={vendors} customers={customers} /></div>}
      </div>
      <Card padded={false}>
        <Table>
          <THead><tr><Th>Period</Th><Th>Route</Th><Th>Vendor → customer</Th><Th align="right">Minutes</Th><Th align="right">ASR / ACD</Th><Th align="right">Revenue</Th>{seeMargin && <Th align="right">Margin</Th>}<Th>Billed</Th></tr></THead>
          <tbody>
            {rows.length === 0 && <TableEmpty colSpan={8}>No traffic in this period.</TableEmpty>}
            {rows.map((t) => (
              <Tr key={t.id}>
                <Td muted className="whitespace-nowrap">{formatDay(t.periodStart)}{t.source === "CDR" && <Badge className="ml-1.5">CDR</Badge>}</Td>
                <Td className="max-w-[220px] truncate">{t.route.destination} <span className="font-mono text-2xs text-ink-3">{t.route.prefix}</span></Td>
                <Td className="text-[12.5px]">{t.vendor} <span className="text-ink-3">→</span> {t.customer}</Td>
                <Td align="right">{num(t.minutes, 1)}</Td>
                <Td align="right" muted className="text-[12px]">{t.asr != null ? `${pct(t.asr, 0)} · ${t.acd ?? "—"}m` : "—"}</Td>
                <Td align="right">{money(t.revenue, t.currency)}{t.currency !== "NGN" && <p className="text-2xs text-ink-3">{money(t.revenueNgn)}</p>}</Td>
                {seeMargin && <Td align="right" className={cn("font-medium", (t.margin ?? 0) < 0 && "text-danger")}>{money(t.margin, t.currency)}{t.currency !== "NGN" && t.marginNgn != null && <p className="text-2xs font-normal text-ink-3">{money(t.marginNgn)}</p>}</Td>}
                <Td>{t.invoice ? <Link href={`/money/invoices/${t.invoice.id}`} className="font-mono text-2xs text-accent hover:underline">{t.invoice.number}</Link> : <span className="text-2xs text-ink-3">Unbilled</span>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {imports.length > 0 && (
        <Card padded={false}>
          <CardHeader title="Recent CDR uploads" className="px-4 pt-3" />
          <Table>
            <THead><tr><Th>Uploaded</Th><Th>Customer</Th><Th align="right">Calls</Th><Th align="right">Rejected</Th><Th>Status</Th></tr></THead>
            <tbody>
              {imports.map((i) => (
                <Tr key={i.id}>
                  <Td muted>{formatDateTime(i.at)} · {i.by}</Td>
                  <Td>{i.carrier}</Td>
                  <Td align="right">{num(i.total)}</Td>
                  <Td align="right" className={cn(i.rejected > 0 && "text-warning")} title={i.errors.map((e) => `Line ${e.line}: ${e.message}`).join("\n")}>{num(i.rejected)}</Td>
                  <Td><StatusBadge status={i.status.toUpperCase()} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
