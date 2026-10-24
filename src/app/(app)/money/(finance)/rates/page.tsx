import type { Metadata } from "next";
import { FxRatesCard } from "@/components/finance/fx-rates";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { geminiEnabled } from "@/server/ai/gemini";
import { rateInfo } from "@/server/fx/rates";
import { getSetting } from "@/server/modules/settings/service";

export const metadata: Metadata = { title: "Exchange rates" };

export default async function RatesPage() {
  const ctx = await requireCtx();
  const [rates, basis] = await Promise.all([rateInfo(), getSetting("finance.fx_basis")]);
  return (
    <div className="grid max-w-[720px] gap-4">
      <FxRatesCard rates={rates} basis={String(basis)} canEdit={can(ctx, "finance.income", "EDIT") || can(ctx, "settings", "EDIT")} canSwitch={can(ctx, "settings", "EDIT")} aiEnabled={geminiEnabled()} feed={!!process.env.FX_API_URL} />
      <p className="text-[12.5px] text-ink-3">The AI reads only public news and market pages and sends no company data. It reports the figures it found with their sources; the system uses a rate only when at least two recent sources agree within 3% and the day-on-day move is under 15%. Otherwise Finance is asked to check.</p>
    </div>
  );
}
