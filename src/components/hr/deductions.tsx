"use client";

import { useState } from "react";
import { money } from "@/lib/format";
import { addDeductionAction, waiveDeductionAction } from "@/server/modules/hr/actions";
import { Button } from "@/ui/button";
import { Card, CardHeader } from "@/ui/card";
import { cn } from "@/ui/cn";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select } from "@/ui/field";
import { humanize } from "@/ui/status";
import { useAction } from "@/ui/use-action";

type Row = { id: string; type: string; amount: number; reason: string; status: string; date: string | null };

export function DeductionsCard({ userId, month, rows, total, final, canWaive, canAdd, title = "Deductions" }: { userId?: string; month: string; rows: Row[]; total: number; final: boolean; canWaive?: boolean; canAdd?: boolean; title?: string }) {
  const [waiving, setWaiving] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);
  const waive = useAction(waiveDeductionAction, { success: "Waived", onSuccess: () => setWaiving(null) });
  const add = useAction(addDeductionAction, { success: "Deduction added", onSuccess: () => setAdding(false) });
  const label = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T00:00:00Z`));
  return (
    <Card>
      <CardHeader title={title} description={`${label} · ${final ? "final (paid)" : "updates as attendance changes"}`} actions={canAdd && userId && !final && <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>Add deduction</Button>} />
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-3">No deductions this month.</p>
      ) : (
        <ul className="grid gap-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 border-b border-line py-2 text-[13px] last:border-0">
              <span className={cn(r.status === "waived" && "text-ink-3 line-through")}>{r.reason}<span className="block text-2xs text-ink-3">{humanize(r.type)}{r.status !== "active" && ` · ${r.status}`}</span></span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={cn("tabular font-medium", r.status === "waived" && "text-ink-3 line-through")}>{money(r.amount)}</span>
                {canWaive && !final && r.status !== "waived" && <Button size="sm" variant="ghost" onClick={() => setWaiving(r)}>Waive</Button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 flex justify-between border-t border-line pt-2 text-[13px] font-semibold"><span>Total</span><span className="tabular">{money(total)}</span></p>
      <Dialog open={!!waiving} onOpenChange={(o) => !o && setWaiving(null)}>
        {waiving && (
          <DialogContent title="Waive deduction" description={waiving.reason} footer={<><Button variant="ghost" onClick={() => setWaiving(null)}>Cancel</Button><Button variant="primary" type="submit" form="waive" loading={waive.pending}>Waive</Button></>}>
            <form id="waive" action={waive.formAction((f) => ({ deductionId: waiving.id, note: f.get("note") }))}>
              <Field label="Why" htmlFor="wv-note" error={waive.errors.note}><Input id="wv-note" name="note" required minLength={3} placeholder="e.g. Office generator failure" /></Field>
            </form>
          </DialogContent>
        )}
      </Dialog>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent title="Add a deduction" description="For advance repayments or other agreed deductions. The staff member is notified." footer={<><Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button variant="primary" type="submit" form="addd" loading={add.pending}>Add</Button></>}>
          <form id="addd" className="grid gap-4" action={add.formAction((f) => ({ userId, month, type: f.get("type"), amount: f.get("amount"), reason: f.get("reason") }))}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type" htmlFor="ad-type"><Select id="ad-type" name="type"><option value="ADVANCE_REPAYMENT">Advance repayment</option><option value="OTHER">Other</option></Select></Field>
              <Field label="Amount (₦)" htmlFor="ad-amt"><Input id="ad-amt" name="amount" type="number" min={0} step="0.01" required /></Field>
            </div>
            <Field label="Reason" htmlFor="ad-reason" error={add.errors.reason}><Input id="ad-reason" name="reason" required /></Field>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
