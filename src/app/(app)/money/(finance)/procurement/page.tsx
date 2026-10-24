import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DomainsView, ResaleView, SuppliersView } from "@/components/finance/procurement";
import { can, scopeOf } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { invoiceCustomers } from "@/server/modules/finance/invoices-service";
import { listDomains, listResale, listSuppliers, priceComparison } from "@/server/modules/finance/procurement-service";
import { currentUnit, listUnits } from "@/server/modules/shell/service";
import { LinkTabs } from "@/ui/tabs";

export const metadata: Metadata = { title: "Procurement" };

const TABS = [
  { key: "resale", label: "Resale", href: "/money/procurement" },
  { key: "domains", label: "Domains", href: "/money/procurement?tab=domains" },
  { key: "suppliers", label: "Suppliers & prices", href: "/money/procurement?tab=suppliers" },
];

export default async function ProcurementPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireCtx();
  if (!can(ctx, "procurement", "VIEW")) notFound();
  const tab = (await searchParams).tab ?? "resale";
  const scope = scopeOf(ctx, "procurement", "CREATE");
  const [suppliers, units, unit] = await Promise.all([listSuppliers(ctx), listUnits(), currentUnit()]);
  const myUnits = units.filter((u) => scope === "ALL" || ctx.unitIds.includes(u.id)).map((u) => ({ id: u.id, name: u.name }));
  // Linking a purchase to a customer needs invoice rights; read-only roles just see the names.
  const customers = scope && can(ctx, "finance.invoices", "CREATE") ? (await invoiceCustomers(ctx)).map((c) => ({ id: c.id, name: c.name })) : [];

  return (
    <div className="grid gap-4">
      <LinkTabs tabs={TABS} active={TABS.some((t) => t.key === tab) ? tab : "resale"} />
      {tab === "domains" ? (
        <DomainsView rows={await listDomains(ctx, {})} registrars={suppliers.filter((s) => !s.kind || s.kind === "registrar").map((s) => ({ id: s.id, name: s.name }))} units={myUnits} customers={customers} canCreate={!!scope} />
      ) : tab === "suppliers" ? (
        <SuppliersView suppliers={suppliers} comparison={await priceComparison(ctx)} canCreate={!!scope} />
      ) : (
        <ResaleView {...(await listResale(ctx, { unitId: unit?.id ?? null }))} suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))} units={myUnits} customers={customers} canCreate={!!scope} />
      )}
    </div>
  );
}
