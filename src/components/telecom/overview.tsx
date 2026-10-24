"use client";

import { TrendChart } from "@/ui/charts";

export function TelecomTrend({ rows, currency, seeMargin }: { rows: { day: string; minutes: number; revenue: number; cost: number | null; margin: number | null }[]; currency: string; seeMargin: boolean }) {
  const data = rows.map((r) => ({ label: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${r.day}T12:00:00Z`)), revenue: r.revenue, cost: r.cost, margin: r.margin, minutes: r.minutes }));
  return seeMargin ? (
    <TrendChart
      data={data}
      xKey="label"
      currency={currency}
      series={[
        { key: "revenue", label: "Revenue", token: "unit-telecom", kind: "bar" },
        { key: "cost", label: "Cost", token: "series-expense", kind: "bar" },
        { key: "margin", label: "Margin", token: "series-profit", kind: "line" },
      ]}
    />
  ) : (
    <TrendChart data={data} xKey="label" format="number" series={[{ key: "minutes", label: "Billed minutes", token: "unit-telecom", kind: "bar" }]} />
  );
}
