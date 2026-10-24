"use client";

import { usePathname } from "next/navigation";
import { LinkTabs } from "@/ui/tabs";

export function FinanceTabs({ tabs }: { tabs: { key: string; href: string; label: string }[] }) {
  const path = usePathname();
  const active = [...tabs].reverse().find((t) => (t.href === "/money" ? path === "/money" : path.startsWith(t.href)))?.key ?? "";
  return <LinkTabs tabs={tabs} active={active} />;
}
