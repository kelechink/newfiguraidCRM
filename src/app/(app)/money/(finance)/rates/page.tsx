import type { Metadata } from "next";
import { FxRatesCard } from "@/components/finance/fx-rates";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { rateInfo } from "@/server/fx/rates";

export const metadata: Metadata = { title: "Exchange rates" };

export default async function RatesPage() {
  const ctx = await requireCtx();
  return (
    <div className="grid max-w-[640px] gap-4">
      <FxRatesCard rates={await rateInfo()} canEdit={can(ctx, "finance.income", "EDIT") || can(ctx, "settings", "EDIT")} feed={!!process.env.FX_API_URL} />
      <p className="text-[12.5px] text-ink-3">Naira figures across Finance and Telecom use these rates. Conversions are exact arithmetic on real rates — the AI assistant can explain them, but never makes up a rate.</p>
    </div>
  );
}
