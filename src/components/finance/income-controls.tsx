"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { localDate } from "@/domain/sop/schedule";
import { recordIncomeAction } from "@/server/modules/finance/actions";
import { Button } from "@/ui/button";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select } from "@/ui/field";
import { useAction } from "@/ui/use-action";

export function RecordIncomeButton({ units, banks, defaultFx }: { units: { id: string; name: string }[]; banks: { id: string; name: string; currency: string }[]; defaultFx: number }) {
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState("NGN");
  const save = useAction(recordIncomeAction, { success: "Payment recorded", onSuccess: () => setOpen(false) });
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}><Plus className="size-3.5" /> Record income</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Record income" description="Bank transfers, cash and telecom receipts. For invoice payments, record them on the invoice." footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="inc" loading={save.pending}>Save</Button></>}>
          <form
            id="inc"
            className="grid gap-4"
            action={save.formAction((f) => ({ unitId: f.get("unit"), amount: f.get("amount"), currency, fxRate: currency === "NGN" ? null : f.get("fx"), method: f.get("method"), receivedAt: f.get("date"), description: f.get("desc"), reference: f.get("ref") || undefined, bankAccountId: f.get("bank") || null }))}
          >
            <div className="grid gap-4 sm:grid-cols-[1fr_100px]">
              <Field label="Amount" htmlFor="i-amt" error={save.errors.amount}><Input id="i-amt" name="amount" type="number" min={0} step="0.01" required autoFocus /></Field>
              <Field label="Currency" htmlFor="i-cur"><Select id="i-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>{["NGN", "USD", "GBP", "EUR"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
            </div>
            {currency !== "NGN" && <Field label={`Rate (₦ per ${currency})`} htmlFor="i-fx" hint="The rate you actually received."><Input id="i-fx" name="fx" type="number" step="0.0001" min={0} defaultValue={currency === "USD" ? defaultFx : ""} required /></Field>}
            <Field label="Description" htmlFor="i-desc" error={save.errors.description}><Input id="i-desc" name="desc" required placeholder="e.g. MTN wholesale settlement week 42" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Unit" htmlFor="i-unit"><Select id="i-unit" name="unit">{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
              <Field label="Method" htmlFor="i-method"><Select id="i-method" name="method" defaultValue="BANK_TRANSFER"><option value="BANK_TRANSFER">Bank transfer</option><option value="CASH">Cash</option><option value="POS">POS</option><option value="CARD">Card</option><option value="OTHER">Other</option></Select></Field>
              <Field label="Date received" htmlFor="i-date"><Input id="i-date" name="date" type="date" defaultValue={localDate(new Date())} required /></Field>
              <Field label="Bank reference" htmlFor="i-ref"><Input id="i-ref" name="ref" /></Field>
            </div>
            {banks.length > 0 && <Field label="Into account" htmlFor="i-bank"><Select id="i-bank" name="bank" defaultValue=""><option value="">—</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.currency})</option>)}</Select></Field>}
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
