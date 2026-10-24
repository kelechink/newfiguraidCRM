import type { Metadata } from "next";
import { CashflowView } from "@/components/finance/cashflow-view";
import { requireCtx } from "@/server/auth/session";
import { forecast } from "@/server/modules/finance/cashflow-service";

export const metadata: Metadata = { title: "Cash flow" };

export default async function CashflowPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const ctx = await requireCtx();
  const { days } = await searchParams;
  const d = days === "30" ? 30 : days === "60" ? 60 : 90;
  return <CashflowView data={await forecast(ctx, { days: d })} />;
}
