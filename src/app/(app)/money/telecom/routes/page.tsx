import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ImportDeckButton } from "@/components/telecom/deck-buttons";
import { RoutesTable } from "@/components/telecom/routes";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { accountOptions } from "@/server/modules/telecom/carriers-service";
import { listRoutes } from "@/server/modules/telecom/rates-service";
import { LinkTabs } from "@/ui/tabs";

export const metadata: Metadata = { title: "Routes & rates" };

export default async function RoutesPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const ctx = await requireCtx();
  if (!can(ctx, "telecom.routes", "VIEW")) notFound();
  const sp = await searchParams;
  const type = sp.type === "TDM" || sp.type === "CC" || sp.type === "CLI" ? sp.type : undefined;
  const canSetBuy = can(ctx, "telecom.buy_rates", "CREATE") || can(ctx, "telecom.buy_rates", "EDIT");
  const canSetSell = can(ctx, "telecom.routes", "EDIT");
  const [rows, accounts] = await Promise.all([listRoutes(ctx, { q: sp.q, type }), can(ctx, "telecom.carriers", "VIEW") ? accountOptions(ctx) : Promise.resolve([])]);
  const deckAccounts = accounts.filter((a) => (a.side === "CUSTOMER" ? canSetSell : canSetBuy));
  const href = (t?: string) => `/money/telecom/routes${t ? `?type=${t}` : ""}`;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <LinkTabs tabs={[{ key: "all", label: "All", href: href() }, ...["CLI", "CC", "TDM"].map((t) => ({ key: t, label: t, href: href(t) }))]} active={type ?? "all"} />
        <form action="/money/telecom/routes">{type && <input type="hidden" name="type" value={type} />}<input name="q" defaultValue={sp.q} placeholder="Destination or prefix" className="h-8 w-52 rounded-md border border-line bg-surface px-2.5 text-[13px] placeholder:text-ink-3 focus:border-accent focus:outline-none" /></form>
        <div className="ml-auto">{deckAccounts.length > 0 && <ImportDeckButton accounts={deckAccounts} />}</div>
      </div>
      <RoutesTable rows={rows} accounts={accounts} canEditRoutes={can(ctx, "telecom.routes", "CREATE")} canSetSell={canSetSell} canSetBuy={canSetBuy} />
    </div>
  );
}
