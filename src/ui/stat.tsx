import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn";

export function StatCard({
  label,
  value,
  sub,
  trend,
  goodWhen = "up",
  href,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** % change vs previous period; null = no comparison. */
  trend?: number | null;
  goodWhen?: "up" | "down";
  href?: string;
  tone?: "danger" | "warning";
}) {
  const good = trend == null || trend === 0 ? null : (trend > 0) === (goodWhen === "up");
  const Icon = trend == null || Math.abs(trend) < 0.5 ? Minus : trend > 0 ? ArrowUpRight : ArrowDownRight;
  const body = (
    <div
      className={cn(
        "group h-full rounded-xl border border-line bg-surface p-4 shadow-card transition-[border-color,box-shadow]",
        href && "hover:border-line-strong hover:shadow-lift",
        tone === "danger" && "border-danger/30",
        tone === "warning" && "border-warning/30",
      )}
    >
      <p className="text-[12px] font-medium text-ink-3">{label}</p>
      <p className="mt-1.5 text-[22px] font-semibold leading-7 tracking-[-0.02em] tabular">{value}</p>
      <div className="mt-1 flex min-h-[18px] items-center gap-2 text-[12px]">
        {trend != null && (
          <span className={cn("inline-flex items-center gap-0.5 font-medium tabular", good === null ? "text-ink-3" : good ? "text-success" : "text-danger")}>
            <Icon className="size-3.5" />
            {Math.abs(trend).toFixed(Math.abs(trend) < 10 ? 1 : 0)}%
          </span>
        )}
        {sub && <span className="truncate text-ink-3">{sub}</span>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

export function pctChange(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}
