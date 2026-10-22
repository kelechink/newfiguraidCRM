"use client";

import {
  Banknote,
  BookOpenCheck,
  CalendarCheck,
  FileText,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  MessageSquare,
  Phone,
  Receipt,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/ui/cn";

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  enabled: boolean; // false = module not built yet
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const ICONS = {
  today: LayoutDashboard,
  tasks: KanbanSquare,
  sops: BookOpenCheck,
  messages: MessageSquare,
  attendance: CalendarCheck,
  inbox: Inbox,
  contacts: UserRound,
  telecom: Phone,
  finance: Wallet,
  invoices: Receipt,
  payroll: Banknote,
  staff: Users,
  documents: FileText,
} satisfies Record<string, LucideIcon>;

export function SidebarNav({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-5 px-2.5" aria-label="Main">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-2 pb-1.5 text-2xs font-medium uppercase tracking-[0.06em] text-ink-3">{g.label}</p>
          <ul className="grid gap-px">
            {g.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              if (!item.enabled) {
                return (
                  <li key={item.href}>
                    <span
                      className="flex h-[30px] cursor-default items-center gap-2.5 rounded-md px-2 text-[13px] text-ink-3/70"
                      title="Coming in a later build step"
                    >
                      <Icon className="size-[15px]" strokeWidth={1.75} />
                      {item.label}
                    </span>
                  </li>
                );
              }
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
