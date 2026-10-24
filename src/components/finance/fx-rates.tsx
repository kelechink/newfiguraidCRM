"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/format";
import { setFxRateAction } from "@/server/modules/finance/actions";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardHeader } from "@/ui/card";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input } from "@/ui/field";
import { useAction } from "@/ui/use-action";

type Rate = { currency: string; rate: number; source: string; asOf: string | null; stale: boolean };

export function FxRatesCard({ rates, canEdit, feed }: { rates: Rate[]; canEdit: boolean; feed: boolean }) {
  const [editing, setEditing] = useState<Rate | null>(null);
  const save = useAction(setFxRateAction, { success: "Rate updated", onSuccess: () => setEditing(null) });
  return (
    <Card padded={false}>
      <CardHeader title="Exchange rates" description={feed ? "Updated every morning from the rates feed; you can override any rate." : "Entered by Finance. Set FX_API_URL to fetch them automatically each morning."} className="px-4 pt-3" />
      <ul className="divide-y divide-line">
        {rates.map((r) => (
          <li key={r.currency} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
            <span>
              <span className="font-medium">1 {r.currency}</span> = <span className="tabular font-semibold">₦{r.rate.toLocaleString("en-NG", { maximumFractionDigits: 2 })}</span>
              <span className="block text-2xs text-ink-3">{r.asOf ? `${r.source === "api" ? "Feed" : "Manual"} · ${formatDateTime(r.asOf)}` : "Default — enter today's rate"}</span>
            </span>
            <span className="flex items-center gap-2">
              {r.stale && <Badge tone="warning">Out of date</Badge>}
              {canEdit && <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>Update</Button>}
            </span>
          </li>
        ))}
      </ul>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={`${editing.currency} to naira`} description="Used for every naira view from now on. Past transactions keep the rate captured when they happened." footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" type="submit" form="fx" loading={save.pending}>Save</Button></>}>
            <form id="fx" action={save.formAction((f) => ({ currency: editing.currency, rate: f.get("rate") }))}>
              <Field label={`₦ per 1 ${editing.currency}`} htmlFor="fx-rate" error={save.errors.rate}><Input id="fx-rate" name="rate" type="number" step="0.0001" min={0} defaultValue={editing.rate} required autoFocus /></Field>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}
