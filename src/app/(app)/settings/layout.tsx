import type { ReactNode } from "react";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { PageHeader } from "@/ui/page-header";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const ctx = await requireCtx();
  const tabs = [
    can(ctx, "settings", "VIEW") || can(ctx, "hr.staff", "VIEW") ? { key: "users", href: "/settings/users", label: "Users" } : null,
    can(ctx, "roles", "VIEW") ? { key: "roles", href: "/settings/roles", label: "Roles & permissions" } : null,
    can(ctx, "settings", "VIEW") ? { key: "general", href: "/settings/general", label: "Units, offices & rules" } : null,
    can(ctx, "inbox.routing", "VIEW") ? { key: "routing", href: "/settings/routing", label: "Routing & AI" } : null,
    can(ctx, "settings", "VIEW") ? { key: "integrations", href: "/settings/integrations", label: "Integrations" } : null,
    can(ctx, "settings", "VIEW") || can(ctx, "privacy.dsr", "VIEW") ? { key: "privacy", href: "/settings/privacy", label: "Privacy & data" } : null,
    can(ctx, "audit", "VIEW") ? { key: "audit", href: "/settings/audit", label: "Audit log" } : null,
  ].filter((t): t is { key: string; href: string; label: string } => !!t);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" description="People, permissions, rules and integrations for Figuraid OS." />
      <SettingsTabs tabs={tabs} />
      {children}
    </div>
  );
}
