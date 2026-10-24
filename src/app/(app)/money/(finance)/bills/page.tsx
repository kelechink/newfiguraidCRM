import type { Metadata } from "next";
import { BillsTable } from "@/components/finance/bills";
import { can, scopeOf } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { listBills } from "@/server/modules/finance/money-service";
import { currentUnit, listUnits } from "@/server/modules/shell/service";

export const metadata: Metadata = { title: "Bills" };

export default async function BillsPage() {
  const ctx = await requireCtx();
  const unit = await currentUnit();
  const [rows, units] = await Promise.all([listBills(ctx, { unitId: unit?.id ?? null }), listUnits()]);
  const scope = scopeOf(ctx, "finance.bills", "CREATE");
  return <BillsTable rows={rows} units={units.filter((u) => scope === "ALL" || ctx.unitIds.includes(u.id)).map((u) => ({ id: u.id, name: u.name }))} canCreate={!!scope} canApprove={can(ctx, "finance.bills", "APPROVE")} />;
}
