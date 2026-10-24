import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { PageHeader } from "@/ui/page-header";

export default async function TelecomLayout({ children }: { children: ReactNode }) {
  const ctx = await requireCtx();
  const tabs = [
    can(ctx, "telecom.traffic", "VIEW") ? { key: "overview", href: "/money/telecom", label: "Overview" } : null,
    can(ctx, "telecom.carriers", "VIEW") ? { key: "carriers", href: "/money/telecom/carriers", label: "Carriers" } : null,
    can(ctx, "telecom.routes", "VIEW") ? { key: "routes", href: "/money/telecom/routes", label: "Routes & rates" } : null,
    can(ctx, "telecom.traffic", "VIEW") ? { key: "traffic", href: "/money/telecom/traffic", label: "Traffic" } : null,
    can(ctx, "telecom.billing", "VIEW") || can(ctx, "telecom.disputes", "VIEW") ? { key: "billing", href: "/money/telecom/billing", label: "Billing & disputes" } : null,
  ].filter((t): t is { key: string; href: string; label: string } => !!t);
  if (!tabs.length) notFound();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Telecom" description="Wholesale voice: carriers, rates, minutes and margin." />
      <FinanceTabs tabs={tabs} />
      {children}
    </div>
  );
}
