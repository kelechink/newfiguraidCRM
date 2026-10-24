import type { ReactNode } from "react";
import { cn } from "./cn";

export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <section className={cn("rounded-xl border border-line bg-surface shadow-card", padded && "p-4 sm:p-5", className)}>{children}</section>;
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em]">{title}</h2>
        {description && <p className="mt-0.5 text-[12.5px] text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
