"use client";

import { Command } from "cmdk";
import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { searchAction } from "@/server/modules/shell/actions";
import { cn } from "@/ui/cn";
import { ICONS } from "./icons";

export interface PaletteItem {
  href: string;
  label: string;
  icon: string;
  keywords?: string;
  group: string;
}

type Hit = { id: string; kind: string; title: string; subtitle?: string; href: string };

const PaletteContext = createContext<() => void>(() => {});
export const useOpenPalette = () => useContext(PaletteContext);

export function CommandPalette({ items, children }: { items: PaletteItem[]; children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await searchAction(q);
      if (id !== seq.current) return;
      setLoading(false);
      setHits(res.ok ? res.data : []);
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  const groups = [...new Set(items.map((i) => i.group))];
  const hitKinds = [...new Set(hits.map((h) => h.kind))];

  return (
    <PaletteContext.Provider value={() => setOpen(true)}>
      {children}
      {open && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-[hsl(var(--shadow)/0.35)] px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
          <Command
            label="Command menu"
            shouldFilter={true}
            loop
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            className="w-full max-w-[600px] animate-pop-in overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
          >
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <Search className="size-4 text-ink-3" />
              <Command.Input
                autoFocus
                value={q}
                onValueChange={setQ}
                placeholder="Search or jump to…"
                className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-3"
              />
              {loading && <span className="size-3.5 animate-spin rounded-full border-2 border-ink-3 border-r-transparent" />}
              <kbd className="rounded border border-line px-1.5 text-2xs text-ink-3">esc</kbd>
            </div>
            <Command.List className="scrollbar-thin max-h-[56vh] overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-8 text-center text-[13px] text-ink-3">{loading ? "Searching…" : "No results."}</Command.Empty>
              {hitKinds.map((kind) => (
                <Command.Group key={kind} heading={`${kind}s`} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-ink-3">
                  {hits
                    .filter((h) => h.kind === kind)
                    .map((h) => (
                      <Command.Item
                        key={`${h.kind}-${h.id}`}
                        value={`${h.kind} ${h.title} ${h.subtitle ?? ""} ${h.id}`}
                        onSelect={() => go(h.href)}
                        className="flex h-10 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[13px] data-[selected=true]:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {h.title}
                          {h.subtitle && <span className="ml-2 text-ink-3">{h.subtitle}</span>}
                        </span>
                        <CornerDownLeft className="size-3 text-ink-3 opacity-0 [[data-selected=true]_&]:opacity-100" />
                      </Command.Item>
                    ))}
                </Command.Group>
              ))}
              {groups.map((g) => (
                <Command.Group key={g} heading={g} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-ink-3">
                  {items
                    .filter((i) => i.group === g)
                    .map((i) => {
                      const Icon = ICONS[i.icon] ?? Search;
                      return (
                        <Command.Item
                          key={i.href + i.label}
                          value={`${i.label} ${i.keywords ?? ""}`}
                          onSelect={() => go(i.href)}
                          className={cn("flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[13px] data-[selected=true]:bg-surface-2")}
                        >
                          <Icon className="size-[15px] text-ink-3" strokeWidth={1.75} />
                          {i.label}
                        </Command.Item>
                      );
                    })}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </div>
      )}
    </PaletteContext.Provider>
  );
}
