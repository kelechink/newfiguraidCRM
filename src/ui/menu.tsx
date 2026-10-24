"use client";

import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

export function Menu({ items, label = "More actions", trigger }: { items: MenuItem[]; label?: string; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  if (!items.length) return null;
  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        {trigger ?? <MoreHorizontal className="size-4" />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-8 z-40 min-w-[180px] animate-pop-in rounded-lg border border-line bg-surface p-1 shadow-lift">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-surface-2 disabled:opacity-40",
                it.danger && "text-danger hover:bg-danger/10",
              )}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
