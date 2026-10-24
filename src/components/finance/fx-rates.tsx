"use client";

import { ExternalLink, Sparkles } from "lucide-react";
import { useState } from "react";
import { formatDateTime } from "@/lib/format";
import { saveSettingAction } from "@/server/modules/settings/actions";
import { setFxRateAction } from "@/server/modules/finance/actions";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardHeader } from "@/ui/card";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select } from "@/ui/field";
import { useAction } from "@/ui/use-action";

type Rate = { currency: string; rate: number; market: string; source: string; asOf: string | null; stale: boolean; sources: { name: string; url?: string; publishedOn?: string; sell?: number | null }[]; other: { market: string; rate: number; asOf: string } | null };
const fmt = (n: number) => `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const SOURCE: Record<string, string> = { ai_search: "AI market search", api: "Official feed", manual: "Entered by Finance", default: "Default — not set yet" };

export function FxRatesCard({ rates, basis, canEdit, canSwitch, aiEnabled, feed }: { rates: Rate[]; basis: string; canEdit: boolean; canSwitch: boolean; aiEnabled: boolean; feed: boolean }) {
  const [editing, setEditing] = useState<Rate | null>(null);
  const save = useAction(setFxRateAction, { success: "Rate updated", onSuccess: () => setEditing(null) });
  const switchBasis = useAction(saveSettingAction, { success: "Conversion basis changed" });
  return (
    <Card padded={false}>
      <CardHeader
        title="Exchange rates"
        description={`Naira figures use the ${basis === "official" ? "official (CBN/NFEM)" : "parallel market (street/BDC)"} rate. ${aiEnabled ? "Updated every morning by AI search of Nigerian market news; used only when two sources agree." : "Add GEMINI_API_KEY to have the AI research parallel rates every morning."}${feed ? " Official rates come from the rates feed." : ""}`}
        className="px-4 pt-3"
        actions={canSwitch && <Button size="sm" variant="ghost" onClick={() => switchBasis.run({ key: "finance.fx_basis", value: basis === "official" ? "parallel" : "official" })}>Use {basis === "official" ? "parallel" : "official"} rate</Button>}
      />
      <ul className="divide-y divide-line">
        {rates.map((r) => (
          <li key={r.currency} className="grid gap-2 px-4 py-3 text-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                <span className="font-medium">1 {r.currency}</span> = <span className="tabular font-semibold">{fmt(r.rate)}</span>
                <span className="ml-2 text-2xs text-ink-3">{r.market}</span>
                <span className="block text-2xs text-ink-3">{r.source === "ai_search" && <Sparkles className="mr-1 inline size-3" />}{SOURCE[r.source] ?? r.source}{r.asOf && ` · ${formatDateTime(r.asOf)}`}{r.other && ` · ${r.other.market} ${fmt(r.other.rate)}`}</span>
              </span>
              <span className="flex items-center gap-2">
                {r.stale && <Badge tone="warning">Out of date</Badge>}
                {canEdit && <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>Set rate</Button>}
              </span>
            </div>
            {r.sources.length > 0 && (
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-2xs text-ink-3">
                {r.sources.map((s, i) => (
                  <li key={i}>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 hover:text-accent">{s.name}{s.sell ? ` ${fmt(s.sell)}` : ""}<ExternalLink className="size-2.5" /></a> : `${s.name}${s.sell ? ` ${fmt(s.sell)}` : ""}`}{s.publishedOn && ` (${s.publishedOn})`}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={`${editing.currency} to naira`} description="Overrides the AI or feed rate until the next daily update. Past transactions keep the rate captured when they happened." footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" type="submit" form="fx" loading={save.pending}>Save</Button></>}>
            <form id="fx" className="grid gap-4" action={save.formAction((f) => ({ currency: editing.currency, rate: f.get("rate"), market: f.get("market") }))}>
              <Field label={`₦ per 1 ${editing.currency}`} htmlFor="fx-rate" error={save.errors.rate}><Input id="fx-rate" name="rate" type="number" step="0.01" min={0} defaultValue={editing.rate} required autoFocus /></Field>
              <Field label="Market" htmlFor="fx-m"><Select id="fx-m" name="market" defaultValue={basis}><option value="parallel">Parallel (street/BDC)</option><option value="official">Official (CBN/NFEM)</option></Select></Field>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}
