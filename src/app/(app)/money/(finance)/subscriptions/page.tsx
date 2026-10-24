import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SubscriptionsTable } from "@/components/finance/subscriptions";
import { money } from "@/lib/format";
import { can, scopeOf } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { listSubscriptions } from "@/server/modules/finance/subscriptions-service";
import { currentUnit, listUnits } from "@/server/modules/shell/service";
import { listAssignableUsers } from "@/server/modules/users/service";
import { StatCard } from "@/ui/stat";

export const metadata: Metadata = { title: "Subscriptions" };

export default async function SubscriptionsPage() {
  const ctx = await requireCtx();
  if (!can(ctx, "subscriptions", "VIEW")) notFound();
  const [{ items, totals }, units, people, unit] = await Promise.all([listSubscriptions(ctx), listUnits(), listAssignableUsers(ctx, "subscriptions"), currentUnit()]);
  const shown = unit ? items.filter((i) => i.unitId === unit.id) : items;
  const scope = scopeOf(ctx, "subscriptions", "CREATE");
  const flagged = shown.filter((i) => i.flags.length > 0);
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Monthly spend" value={money(totals.monthly, "NGN", { compact: true })} sub="Active and trial tools, in naira" />
        <StatCard label="Annualised" value={money(totals.annual, "NGN", { compact: true })} />
        <StatCard label="Renewing in 30 days" value={String(totals.dueIn30)} sub={flagged.length ? `${flagged.length} flagged unused or duplicate` : "Nothing flagged"} />
      </div>
      <SubscriptionsTable items={shown} units={units.filter((u) => scope === "ALL" || ctx.unitIds.includes(u.id)).map((u) => ({ id: u.id, name: u.name }))} people={people.map((p) => ({ id: p.id, name: p.name }))} canEdit={!!scope} />
    </div>
  );
}
