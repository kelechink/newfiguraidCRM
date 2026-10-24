"use client";

import { LogOut, Menu, Moon, Search, ShieldCheck, Sun, SunMoon } from "lucide-react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";
import { Avatar } from "@/ui/avatar";
import { cn } from "@/ui/cn";
import { ToastProvider } from "@/ui/toast";
import { CommandPalette, useOpenPalette, type PaletteItem } from "./command-palette";
import { LiveProvider } from "./live";
import { NotificationBell } from "./notifications";
import { SidebarNav, type NavGroup } from "./sidebar";
import { UnitSwitcher } from "./unit-switcher";

type Theme = "system" | "light" | "dark";

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const saved = document.cookie.match(/(?:^|; )fos_theme=(light|dark)/)?.[1] as Theme | undefined;
    if (saved) setTheme(saved);
  }, []);
  const cycle = () => {
    const next: Theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
    if (next === "system") {
      document.documentElement.removeAttribute("data-theme");
      document.cookie = "fos_theme=; Max-Age=0; Path=/; SameSite=Lax";
    } else {
      document.documentElement.setAttribute("data-theme", next);
      document.cookie = `fos_theme=${next}; Max-Age=31536000; Path=/; SameSite=Lax`;
    }
  };
  return [theme, cycle];
}

function SearchButton() {
  const open = useOpenPalette();
  return (
    <button
      onClick={open}
      className="flex h-8 w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink-3 shadow-card transition-colors hover:border-line-strong hover:text-ink-2"
    >
      <Search className="size-3.5" />
      <span className="flex-1 text-left">Search or jump to…</span>
      <kbd className="rounded border border-line px-1 text-2xs">⌘K</kbd>
    </button>
  );
}

function MobileSearch() {
  const open = useOpenPalette();
  return (
    <button onClick={open} className="rounded-md p-1.5 text-ink-2 hover:bg-surface-2" aria-label="Search">
      <Search className="size-5" />
    </button>
  );
}

export function AppShell({
  user,
  groups,
  units,
  currentUnit,
  children,
}: {
  user: { id: string; name: string; roleName: string };
  groups: NavGroup[];
  units: { code: string; name: string }[];
  currentUnit: string | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [theme, cycleTheme] = useTheme();
  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : SunMoon;
  const palette: PaletteItem[] = groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center gap-2 px-4">
        <span className="flex size-6 items-center justify-center rounded-[6px] bg-accent text-[11px] font-bold text-white shadow-[inset_0_1px_0_hsl(0_0%_100%/0.2)]">F</span>
        <span className="flex-1 text-[14px] font-semibold tracking-[-0.01em]">Figuraid OS</span>
        <NotificationBell />
      </div>
      <div className="grid gap-2 px-3 pb-4">
        <SearchButton />
        <UnitSwitcher units={units} current={currentUnit} />
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto pb-4">
        <SidebarNav groups={groups} onNavigate={() => setOpen(false)} />
      </div>
      <div className="flex items-center gap-1 border-t border-line px-3 py-2.5">
        <Link href="/account/security" className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-0.5 hover:bg-surface-3/60" onClick={() => setOpen(false)}>
          <Avatar id={user.id} name={user.name} size={26} />
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-medium">{user.name}</p>
            <p className="truncate text-2xs text-ink-3">{user.roleName}</p>
          </div>
        </Link>
        <Link href="/account/security" className="rounded-md p-1.5 text-ink-3 hover:bg-surface-3 hover:text-ink" aria-label="Account security" title="Account security">
          <ShieldCheck className="size-4" />
        </Link>
        <button onClick={cycleTheme} className="rounded-md p-1.5 text-ink-3 hover:bg-surface-3 hover:text-ink" aria-label={`Theme: ${theme}`} title={`Theme: ${theme}`}>
          <ThemeIcon className="size-4" />
        </button>
        <button onClick={() => signOut({ callbackUrl: "/login" })} className="rounded-md p-1.5 text-ink-3 hover:bg-surface-3 hover:text-ink" aria-label="Sign out" title="Sign out">
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );

  return (
    <ToastProvider>
      <LiveProvider>
        <CommandPalette items={palette}>
          <div className="min-h-dvh lg:pl-[240px]">
            <aside className="fixed inset-y-0 left-0 z-30 hidden w-[240px] border-r border-line bg-surface-2/60 lg:block">{sidebar}</aside>

            <div className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-line bg-canvas/85 px-4 backdrop-blur lg:hidden">
              <button onClick={() => setOpen(true)} className="-ml-1.5 rounded-md p-1.5 text-ink-2 hover:bg-surface-2" aria-label="Open menu">
                <Menu className="size-5" />
              </button>
              <span className="flex-1 text-[14px] font-semibold">Figuraid OS</span>
              <MobileSearch />
            </div>
            <div className={cn("fixed inset-0 z-40 lg:hidden", open ? "" : "pointer-events-none")} aria-hidden={!open}>
              <div className={cn("absolute inset-0 bg-[hsl(var(--shadow)/0.35)] transition-opacity", open ? "opacity-100" : "opacity-0")} onClick={() => setOpen(false)} />
              <aside className={cn("absolute inset-y-0 left-0 w-[280px] border-r border-line bg-surface-2 transition-transform duration-200", open ? "translate-x-0 shadow-pop" : "-translate-x-full")}>
                {sidebar}
              </aside>
            </div>

            <main className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{children}</main>
          </div>
        </CommandPalette>
      </LiveProvider>
    </ToastProvider>
  );
}
