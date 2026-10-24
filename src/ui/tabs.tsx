import Link from "next/link";
import { cn } from "./cn";

/** URL-driven tabs (server-rendered; each tab is a link). */
export function LinkTabs({ tabs, active }: { tabs: { href: string; label: string; count?: number; key: string }[]; active: string }) {
  return (
    <nav className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto border-b border-line px-1" aria-label="Sections">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "relative -mb-px flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-[13px] font-medium transition-colors",
            t.key === active ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink-2",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="rounded-[4px] bg-surface-2 px-1.5 text-2xs tabular text-ink-3">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
