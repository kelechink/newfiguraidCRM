import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VaultTable } from "@/components/vault/vault";
import { can, scopeOf } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { listUnits } from "@/server/modules/shell/service";
import { carrierOptions } from "@/server/modules/telecom/carriers-service";
import { CATEGORIES, canUpload, listDocuments } from "@/server/modules/vault/service";
import { PageHeader } from "@/ui/page-header";
import { LinkTabs } from "@/ui/tabs";
import { humanize } from "@/ui/status";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ category?: string; expiring?: string; q?: string }> }) {
  const ctx = await requireCtx();
  if (!can(ctx, "documents", "VIEW")) notFound();
  const sp = await searchParams;
  const category = CATEGORIES.find((c) => c === sp.category);
  const [rows, units, carriers] = await Promise.all([
    listDocuments(ctx, { category, expiring: sp.expiring === "1", q: sp.q }),
    listUnits(),
    can(ctx, "telecom.carriers", "VIEW") ? carrierOptions(ctx) : Promise.resolve([]),
  ]);
  const scope = scopeOf(ctx, "documents", "CREATE");
  const tabs = [{ key: "all", label: "All", href: "/team/documents" }, { key: "expiring", label: "Expiring", href: "/team/documents?expiring=1" }, ...["CARRIER_AGREEMENT", "CLIENT_CONTRACT", "CAC", "COMPLIANCE", "STAFF_CONTRACT"].map((c) => ({ key: c, label: humanize(c), href: `/team/documents?category=${c}` }))];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Documents" description="Contracts, CAC and compliance papers, carrier agreements and signed staff packs, with expiry alerts." />
      <div className="flex flex-wrap items-center gap-3">
        <LinkTabs tabs={tabs} active={sp.expiring === "1" ? "expiring" : category ?? "all"} />
        <form action="/team/documents" className="ml-auto"><input name="q" defaultValue={sp.q} placeholder="Search title or party" className="h-8 w-56 rounded-md border border-line bg-surface px-2.5 text-[13px] placeholder:text-ink-3 focus:border-accent focus:outline-none" /></form>
      </div>
      <VaultTable rows={rows} units={units.filter((u) => scope === "ALL" || ctx.unitIds.includes(u.id)).map((u) => ({ id: u.id, name: u.name }))} carriers={carriers} canUpload={canUpload(ctx)} canEdit={can(ctx, "documents", "EDIT")} />
    </div>
  );
}
