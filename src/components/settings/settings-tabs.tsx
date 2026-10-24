"use client";

import { usePathname } from "next/navigation";
import { LinkTabs } from "@/ui/tabs";

export function SettingsTabs({ tabs }: { tabs: { key: string; href: string; label: string }[] }) {
  const path = usePathname();
  const active = tabs.find((t) => path.startsWith(t.href))?.key ?? tabs[0]?.key ?? "";
  return <LinkTabs tabs={tabs} active={active} />;
}
