import { cn } from "@/ui/cn";

export function Progress({ pct, className }: { pct: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-surface-3", className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", pct >= 100 ? "bg-success" : pct >= 60 ? "bg-accent" : pct >= 30 ? "bg-warning" : "bg-danger")} style={{ width: `${clamped}%` }} />
    </div>
  );
}
