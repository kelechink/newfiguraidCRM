"use client";

import { Check, ChevronsUpDown, Layers } from "lucide-react";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { setUnitFilterAction } from "@/server/modules/shell/actions";
import { cn } from "@/ui/cn";
import { UNIT_STYLE } from "@/ui/units";

export function UnitSwitcher({ units, current }: { units: { code: string; name: string }[]; current: string | null }) {
  const [, start] = useTransition();
  const [selected, setSelected] = useOptimistic(current);
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

  const options = [{ code: null as string | null, name: "All units" }, ...units];
  const active = options.find((o) => o.code === selected) ?? options[0]!;

  const choose = (code: string | null) => {
    setOpen(false);
    start(async () => {
      setSelected(code);
      await setUnitFilterAction(code);
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-8 w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-left text-[13px] font-medium shadow-card transition-colors hover:border-line-strong"
      >
        {active.code ? (
          <span className={cn("size-2 rounded-full", UNIT_STYLE[active.code]?.dot)} />
        ) : (
          <Layers className="size-3.5 text-ink-3" />
        )}
        <span className="flex-1 truncate">{active.name}</span>
        <ChevronsUpDown className="size-3.5 text-ink-3" />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Business unit"
          className="absolute inset-x-0 top-9 z-50 animate-pop-in rounded-lg border border-line bg-surface p-1 shadow-lift"
        >
          {options.map((o) => (
            <li key={o.code ?? "all"}>
              <button
                role="option"
                aria-selected={o.code === selected}
                onClick={() => choose(o.code)}
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] hover:bg-surface-2"
              >
                {o.code ? <span className={cn("size-2 rounded-full", UNIT_STYLE[o.code]?.dot)} /> : <Layers className="size-3.5 text-ink-3" />}
                <span className="flex-1 text-left">{o.name}</span>
                {o.code === selected && <Check className="size-3.5 text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
