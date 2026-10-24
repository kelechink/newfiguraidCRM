"use client";

import { Table2, LineChart as LineIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { money, num } from "@/lib/format";
import { cn } from "./cn";

// Chart conventions (from the data-viz guidance): one y-axis, 2px lines, ≤24px bars
// with 4px rounded ends, hairline recessive grid, legend for ≥2 series, hover
// tooltip, and a table view so colour is never the only channel.

/** Resolve design tokens (HSL triplets) to colours SVG attributes can use, tracking theme changes. */
export function useTokens(names: string[]): Record<string, string> {
  const key = names.join(",");
  const [colors, setColors] = useState<Record<string, string>>({});
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      setColors(Object.fromEntries(names.map((n) => [n, `hsl(${cs.getPropertyValue(`--${n}`).trim()})`])));
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", read);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", read);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return colors;
}

export interface Series {
  key: string;
  label: string;
  token: string; // CSS variable name without "--", e.g. "unit-academy" or "ink"
  kind?: "line" | "bar" | "area";
  dashed?: boolean;
  width?: number;
}

type Format = "money" | "number" | "minutes";
const fmt = (v: number, f: Format, compact = false, currency = "NGN") => (f === "money" ? money(v, currency, { compact }) : f === "minutes" ? `${num(v)} min` : num(v));

function ChartTooltip({ active, payload, label, series, format, colors, currency }: TooltipProps<number, string> & { series: Series[]; format: Format; colors: Record<string, string>; currency: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[180px] rounded-lg border border-line bg-surface px-3 py-2 shadow-lift">
      <p className="mb-1.5 text-2xs font-medium text-ink-3">{label}</p>
      {series.map((s) => {
        const p = payload.find((x) => x.dataKey === s.key);
        if (!p || p.value == null) return null;
        return (
          <p key={s.key} className="flex items-center gap-2 text-[12px]">
            <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: colors[s.token] }} />
            <span className="flex-1 text-ink-2">{s.label}</span>
            <span className="font-medium tabular text-ink">{fmt(Number(p.value), format, false, currency)}</span>
          </p>
        );
      })}
    </div>
  );
}

export function Legend({ series, colors }: { series: Series[]; colors: Record<string, string> }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5 text-[12px] text-ink-2">
          <span className={cn("inline-block rounded-full", s.kind === "bar" ? "size-2.5 rounded-[3px]" : "h-0.5 w-3.5")} style={{ background: colors[s.token] }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

export function TrendChart({
  data,
  xKey,
  series,
  format = "money",
  height = 260,
  reference,
  stackedBars,
  toolbar,
  currency = "NGN",
}: {
  data: Record<string, string | number | null>[];
  xKey: string;
  series: Series[];
  format?: Format;
  height?: number;
  reference?: { value: number; label: string };
  stackedBars?: boolean;
  toolbar?: React.ReactNode;
  currency?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  const colors = useTokens(useMemo(() => [...new Set([...series.map((s) => s.token), "chart-grid", "ink-3", "danger", "surface"])], [series]));
  const ready = Object.keys(colors).length > 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Legend series={series} colors={colors} />
        <div className="ml-auto flex items-center gap-2">
          {toolbar}
          <button
            type="button"
            onClick={() => setAsTable((t) => !t)}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line px-2 text-2xs font-medium text-ink-3 hover:text-ink"
            aria-pressed={asTable}
          >
            {asTable ? <LineIcon className="size-3" /> : <Table2 className="size-3" />}
            {asTable ? "Chart" : "Table"}
          </button>
        </div>
      </div>
      {asTable ? (
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-2xs uppercase tracking-[0.04em] text-ink-3">
                <th className="py-1.5 pr-3 font-medium" />
                {series.map((s) => (
                  <th key={s.key} className="py-1.5 pr-3 text-right font-medium">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="py-1.5 pr-3 text-ink-2">{row[xKey]}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-1.5 pr-3 text-right tabular">{row[s.key] == null ? "—" : fmt(Number(row[s.key]), format, false, currency)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }} aria-label="Chart" role="img">
          {ready && (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 4 }} barCategoryGap="30%">
                <CartesianGrid vertical={false} stroke={colors["chart-grid"]} strokeWidth={1} />
                <XAxis dataKey={xKey} tickLine={false} axisLine={{ stroke: colors["chart-grid"] }} tick={{ fill: colors["ink-3"], fontSize: 11 }} tickMargin={8} minTickGap={12} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: colors["ink-3"], fontSize: 11 }} width={56} tickFormatter={(v: number) => fmt(v, format, true, currency)} />
                <Tooltip cursor={{ stroke: colors["ink-3"], strokeWidth: 1 }} content={<ChartTooltip series={series} format={format} colors={colors} currency={currency} />} />
                {reference && <ReferenceLine y={reference.value} stroke={colors.danger} strokeDasharray="0" strokeWidth={1} label={{ value: reference.label, fill: colors["ink-3"], fontSize: 10, position: "insideTopLeft" }} />}
                {series.map((s) =>
                  s.kind === "bar" ? (
                    <Bar key={s.key} dataKey={s.key} fill={colors[s.token]} maxBarSize={24} radius={stackedBars ? 0 : [4, 4, 0, 0]} stackId={stackedBars ? "a" : undefined} stroke={colors.surface} strokeWidth={stackedBars ? 2 : 0} />
                  ) : s.kind === "area" ? (
                    <Area key={s.key} type="monotone" dataKey={s.key} stroke={colors[s.token]} strokeWidth={2} fill={colors[s.token]} fillOpacity={0.1} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: colors.surface }} />
                  ) : (
                    <Line key={s.key} type="monotone" dataKey={s.key} stroke={colors[s.token]} strokeWidth={s.width ?? 2} strokeDasharray={s.dashed ? "4 4" : undefined} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: colors.surface }} connectNulls />
                  ),
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}

/** Tiny inline trend for KPI cards (single series, no axes). */
export function Sparkline({ values, token = "accent", height = 32 }: { values: number[]; token?: string; height?: number }) {
  const colors = useTokens([token]);
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div style={{ height }} aria-hidden>
      {colors[token] && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Bar dataKey="v" fill={colors[token]} radius={[2, 2, 0, 0]} maxBarSize={8} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
