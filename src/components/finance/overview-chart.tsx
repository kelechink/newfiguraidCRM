"use client";

import { TrendChart } from "@/ui/charts";

export function FinanceOverviewChart({ rows }: { rows: { label: string; in: number; out: number; profit: number }[] }) {
  return (
    <TrendChart
      data={rows}
      xKey="label"
      series={[
        { key: "in", label: "Money in", token: "ink", kind: "bar" },
        { key: "out", label: "Money out", token: "series-expense", kind: "bar" },
        { key: "profit", label: "Profit", token: "series-profit", kind: "line" },
      ]}
    />
  );
}
