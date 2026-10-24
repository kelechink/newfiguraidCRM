import type { Metadata } from "next";
import { AccountsTable, DisputesTable } from "@/components/telecom/billing";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { billingOverview, listDisputes } from "@/server/modules/telecom/billing-service";
import { accountOptions } from "@/server/modules/telecom/carriers-service";
import { canSeeBuy } from "@/server/modules/telecom/scope";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Telecom billing" };

export default async function TelecomBillingPage() {
  const ctx = await requireCtx();
  const seeBilling = can(ctx, "telecom.billing", "VIEW");
  const seeDisputes = can(ctx, "telecom.disputes", "VIEW");
  if (!seeBilling && !seeDisputes) notFound();
  const [accounts, disputes, options] = await Promise.all([
    seeBilling ? billingOverview(ctx) : Promise.resolve([]),
    seeDisputes ? listDisputes(ctx, {}) : Promise.resolve([]),
    seeDisputes && can(ctx, "telecom.carriers", "VIEW") ? accountOptions(ctx) : Promise.resolve([]),
  ]);
  return (
    <div className="grid gap-4">
      {seeBilling && <AccountsTable rows={accounts} can={{ invoice: can(ctx, "telecom.billing", "CREATE"), statement: can(ctx, "telecom.billing", "CREATE") && canSeeBuy(ctx), prepaid: can(ctx, "telecom.prepaid", "EDIT"), dispute: can(ctx, "telecom.disputes", "CREATE") }} />}
      {seeDisputes && <DisputesTable rows={disputes} accounts={options.filter((o) => o.side === "CUSTOMER" || canSeeBuy(ctx))} canOpen={can(ctx, "telecom.disputes", "CREATE")} canEdit={can(ctx, "telecom.disputes", "EDIT")} />}
    </div>
  );
}
