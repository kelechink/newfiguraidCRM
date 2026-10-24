"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/ui/cn";
import { ICONS } from "./icons";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/money") return pathname === "/money" || /^\/money\/(payments|expenses|bills|cashflow|reports)/.test(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-5 px-2.5" aria-label="Main">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-2 pb-1.5 text-2xs font-medium uppercase tracking-[0.06em] text-ink-3">{g.label}</p>
          <ul className="grid gap-px">
            {g.items.map((item) => {
              const Icon = ICONS[item.icon] ?? ICONS.home!;
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-[30px] items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors",
                      active ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-ink-2 hover:bg-surface-3/70 hover:text-ink",
                    )}
                  >
                    <Icon className={cn("size-[15px]", active ? "text-accent" : "")} strokeWidth={1.75} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
