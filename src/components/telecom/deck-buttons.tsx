"use client";

import { Download, Upload } from "lucide-react";
import { useState } from "react";
import { localDate } from "@/domain/sop/schedule";
import { exportRateDeckAction, importRateDeckAction } from "@/server/modules/telecom/actions";
import { Button } from "@/ui/button";
import { Dialog, DialogContent } from "@/ui/dialog";
import { downloadText } from "@/ui/download";
import { Field, Input, Select } from "@/ui/field";
import { useAction } from "@/ui/use-action";

type Result = { created: number; changed: number; unchanged: number; newRoutes: number; increasesWithoutNotice: string[]; errors: { line: number; message: string }[]; errorCount: number };

export function ExportDeckButton({ accountId, label = "Export rates" }: { accountId: string; label?: string }) {
  const exp = useAction(exportRateDeckAction, { refresh: false, onSuccess: (r) => downloadText(r.filename, r.csv, "text/csv") });
  return <Button size="sm" variant="secondary" onClick={() => exp.run({ accountId })} loading={exp.pending}><Download className="size-3.5" /> {label}</Button>;
}

export function ImportDeckButton({ accounts }: { accounts: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const imp = useAction(importRateDeckAction, { success: "Rate deck imported", onSuccess: (r) => setResult(r) });
  return (
    <>
      <Button variant="secondary" onClick={() => { setResult(null); setOpen(true); }} disabled={!accounts.length}><Upload className="size-3.5" /> Upload rate deck</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Upload a rate deck" description="CSV with prefix and rate columns; destination and effective date are optional. Each changed rate is versioned — nothing is overwritten." footer={result ? <Button variant="primary" onClick={() => setOpen(false)}>Done</Button> : <><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="deck" loading={imp.pending}>Import</Button></>}>
          {result ? (
            <div className="grid gap-3 text-[13px]">
              <p>{result.created} new rates · {result.changed} changed · {result.unchanged} unchanged · {result.newRoutes} new routes</p>
              {result.increasesWithoutNotice.length > 0 && <p className="rounded-md bg-warning/10 px-3 py-2 text-warning">{result.increasesWithoutNotice.length} increase{result.increasesWithoutNotice.length === 1 ? "" : "s"} take effect in under 7 days — make sure the customer has been notified: {result.increasesWithoutNotice.slice(0, 5).join(", ")}{result.increasesWithoutNotice.length > 5 ? "…" : ""}</p>}
              {result.errorCount > 0 && (
                <div>
                  <p className="font-medium text-danger">{result.errorCount} line{result.errorCount === 1 ? "" : "s"} skipped</p>
                  <ul className="mt-1 max-h-40 overflow-auto text-[12px] text-ink-3">{result.errors.map((e, i) => <li key={i}>Line {e.line}: {e.message}</li>)}</ul>
                </div>
              )}
            </div>
          ) : (
            <form id="deck" className="grid gap-4" action={imp.formAction((f) => f)}>
              <Field label="Account" htmlFor="dk-acc"><Select id="dk-acc" name="accountId">{accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Route type" htmlFor="dk-type"><Select id="dk-type" name="routeType" defaultValue="CLI"><option value="CLI">CLI</option><option value="CC">CC</option><option value="TDM">TDM</option></Select></Field>
                <Field label="Effective from" htmlFor="dk-eff" hint="Used where a row has no date."><Input id="dk-eff" name="effectiveFrom" type="date" defaultValue={localDate(new Date())} required /></Field>
              </div>
              <Field label="File" htmlFor="dk-file"><Input id="dk-file" name="file" type="file" accept=".csv,text/csv" required /></Field>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
